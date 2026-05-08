-- ============================================================
-- Migracion: bd_anim3d_saltos (esquema antiguo) -> bd_anim3d (unificado)
--
-- Pre-requisitos:
--  1. Crear bd_anim3d con scripts/init_db_unificada.sql
--  2. Tener bd_anim3d_saltos accesible al mismo usuario MySQL
--  3. Hacer BACKUP COMPLETO antes de ejecutar:
--       mysqldump -u root -p bd_anim3d_saltos > backup_pre_migracion.sql
--
-- Comportamiento ante alias colisionados:
--  - Si un alias existe en `usuarios` y en `usuarios_futbol`, se asume
--    el MISMO jugador y se reutiliza el id de `usuarios`.
--  - Si solo existe en `usuarios_futbol`, se inserta en `usuarios` con
--    altura por defecto 1.70 (revisar manualmente despues).
--  - Si solo existe en `usuarios`, queda igual.
--
-- Comportamiento ante alertas:
--  - alertas_json se desnormaliza en filas de gestos_alertas (codigo,
--    severidad, mensaje). Se conserva la severidad original o 'media'.
--
-- Idempotente: usa INSERT IGNORE / ON DUPLICATE para poder re-ejecutar.
-- ============================================================

USE bd_anim3d;

-- ── Paso 1. Migrar usuarios desde la BD antigua ───────────────
INSERT IGNORE INTO usuarios (alias, nombre_completo, altura_m, peso_kg, fecha_registro)
SELECT alias, nombre_completo, altura_m, peso_kg, fecha_registro
FROM bd_anim3d_saltos.usuarios;

-- ── Paso 2. Fusionar usuarios_futbol con usuarios ─────────────
-- Si el alias ya existe (mismo jugador), no se duplica.
-- Para los nuevos, se asume altura 1.70 (placeholder, ajustar luego).
INSERT IGNORE INTO usuarios (alias, nombre_completo, altura_m, peso_kg, fecha_registro)
SELECT uf.alias,
       uf.nombre,
       COALESCE(uf.altura_m, 1.70),
       uf.peso_kg,
       uf.fecha_creacion
FROM bd_anim3d_saltos.usuarios_futbol uf
LEFT JOIN bd_anim3d_saltos.usuarios u ON u.alias = uf.alias
WHERE u.id_usuario IS NULL;

-- ── Paso 3. Tabla temporal de mapeo de IDs antiguos -> nuevos ─
DROP TEMPORARY TABLE IF EXISTS map_usuarios_salto;
CREATE TEMPORARY TABLE map_usuarios_salto (
    id_antiguo INT PRIMARY KEY,
    id_nuevo   INT NOT NULL
) ENGINE=Memory;

INSERT INTO map_usuarios_salto (id_antiguo, id_nuevo)
SELECT us_old.id_usuario, us_new.id_usuario
FROM bd_anim3d_saltos.usuarios us_old
JOIN usuarios us_new ON us_new.alias = us_old.alias;

DROP TEMPORARY TABLE IF EXISTS map_usuarios_futbol;
CREATE TEMPORARY TABLE map_usuarios_futbol (
    id_antiguo INT PRIMARY KEY,
    id_nuevo   INT NOT NULL
) ENGINE=Memory;

INSERT INTO map_usuarios_futbol (id_antiguo, id_nuevo)
SELECT uf_old.id, us_new.id_usuario
FROM bd_anim3d_saltos.usuarios_futbol uf_old
JOIN usuarios us_new ON us_new.alias = uf_old.alias;

-- ── Paso 4. Migrar saltos -> gestos + gestos_salto ────────────
-- Preservamos las fechas. id_gesto es nuevo (autoincrement).
DROP TEMPORARY TABLE IF EXISTS map_saltos;
CREATE TEMPORARY TABLE map_saltos (
    id_salto_antiguo INT PRIMARY KEY,
    id_gesto_nuevo   INT NOT NULL
) ENGINE=Memory;

-- Migrar fila a fila para poder capturar el LAST_INSERT_ID().
-- Usamos un cursor en un procedimiento temporal.
DELIMITER //
DROP PROCEDURE IF EXISTS _migrar_saltos //
CREATE PROCEDURE _migrar_saltos()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_id_old INT;
    DECLARE v_id_usuario INT;
    DECLARE v_tipo VARCHAR(20);
    DECLARE v_distancia INT;
    DECLARE v_tiempo DECIMAL(6,3);
    DECLARE v_confianza DECIMAL(4,3);
    DECLARE v_potencia DECIMAL(8,2);
    DECLARE v_asimetria DECIMAL(6,2);
    DECLARE v_ang_rod DECIMAL(6,2);
    DECLARE v_ang_cad DECIMAL(6,2);
    DECLARE v_estab JSON;
    DECLARE v_curvas JSON;
    DECLARE v_metodo VARCHAR(30);
    DECLARE v_fecha DATETIME;
    DECLARE v_video LONGBLOB;
    DECLARE v_video_nombre VARCHAR(255);
    DECLARE v_video_mime VARCHAR(100);
    DECLARE v_id_nuevo INT;

    DECLARE cur CURSOR FOR
        SELECT s.id_salto, m.id_nuevo, s.tipo_salto, s.distancia_cm,
               s.tiempo_vuelo_s, s.confianza_ia, s.potencia_w, s.asimetria_pct,
               s.angulo_rodilla_deg, s.angulo_cadera_deg, s.estabilidad_aterrizaje,
               s.curvas_json, s.metodo_origen, s.fecha_salto,
               s.video_blob, s.video_nombre, s.video_mime
        FROM bd_anim3d_saltos.saltos s
        JOIN map_usuarios_salto m ON m.id_antiguo = s.id_usuario;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    bucle: LOOP
        FETCH cur INTO v_id_old, v_id_usuario, v_tipo, v_distancia,
                       v_tiempo, v_confianza, v_potencia, v_asimetria,
                       v_ang_rod, v_ang_cad, v_estab, v_curvas, v_metodo,
                       v_fecha, v_video, v_video_nombre, v_video_mime;
        IF done = 1 THEN LEAVE bucle; END IF;

        INSERT INTO gestos (id_usuario, modulo, subtipo, fecha, metodo_origen, confianza_ia)
        VALUES (v_id_usuario, 'salto', v_tipo, v_fecha, v_metodo, v_confianza);
        SET v_id_nuevo = LAST_INSERT_ID();

        INSERT INTO gestos_salto
            (id_gesto, tipo_salto, distancia_cm, tiempo_vuelo_s, potencia_w,
             asimetria_pct, angulo_rodilla_deg, angulo_cadera_deg, estabilidad_aterrizaje)
        VALUES
            (v_id_nuevo, v_tipo, v_distancia, v_tiempo, v_potencia,
             v_asimetria, v_ang_rod, v_ang_cad, v_estab);

        IF v_curvas IS NOT NULL THEN
            INSERT INTO gestos_curvas (id_gesto, curvas_json)
            VALUES (v_id_nuevo, v_curvas);
        END IF;

        IF v_video IS NOT NULL THEN
            INSERT INTO gestos_videos (id_gesto, video_blob, video_nombre, video_mime)
            VALUES (v_id_nuevo, v_video, v_video_nombre, v_video_mime);
        END IF;

        INSERT INTO map_saltos VALUES (v_id_old, v_id_nuevo);
    END LOOP;
    CLOSE cur;
END //
DELIMITER ;

CALL _migrar_saltos();
DROP PROCEDURE _migrar_saltos;

-- ── Paso 5. Migrar golpes_futbol -> gestos + gestos_futbol ────
DROP TEMPORARY TABLE IF EXISTS map_golpeos;
CREATE TEMPORARY TABLE map_golpeos (
    id_golpeo_antiguo INT PRIMARY KEY,
    id_gesto_nuevo    INT NOT NULL
) ENGINE=Memory;

DELIMITER //
DROP PROCEDURE IF EXISTS _migrar_golpeos //
CREATE PROCEDURE _migrar_golpeos()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_id_old INT;
    DECLARE v_id_usuario INT;
    DECLARE v_fecha DATETIME;
    DECLARE v_metodo VARCHAR(30);
    DECLARE v_confianza FLOAT;
    DECLARE v_pierna_g VARCHAR(50);
    DECLARE v_pierna_a VARCHAR(50);
    DECLARE v_vel DECIMAL(6,2);
    DECLARE v_frame_imp INT;
    DECLARE v_ang_cad FLOAT;
    DECLARE v_ang_rod FLOAT;
    DECLARE v_ang_tob FLOAT;
    DECLARE v_estab_t FLOAT;
    DECLARE v_clasif VARCHAR(50);
    DECLARE v_curvas JSON;
    DECLARE v_landmarks JSON;
    DECLARE v_alertas JSON;
    DECLARE v_video MEDIUMBLOB;
    DECLARE v_video_nombre VARCHAR(255);
    DECLARE v_video_mime VARCHAR(100);
    DECLARE v_id_nuevo INT;

    DECLARE cur CURSOR FOR
        SELECT g.id_golpeo, m.id_nuevo, g.fecha, g.metodo_origen, g.confianza,
               g.pierna_golpeo, g.pierna_apoyo, g.velocidad_pie_ms, g.frame_impacto,
               g.angulo_cadera_deg, g.angulo_rodilla_deg, g.angulo_tobillo_deg,
               g.estabilidad_tronco, g.clasificacion,
               g.curvas_json, g.landmarks_json, g.alertas_json,
               g.video_blob, g.video_nombre, g.video_mime
        FROM bd_anim3d_saltos.golpes_futbol g
        JOIN map_usuarios_futbol m ON m.id_antiguo = g.id_usuario;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    bucle: LOOP
        FETCH cur INTO v_id_old, v_id_usuario, v_fecha, v_metodo, v_confianza,
                       v_pierna_g, v_pierna_a, v_vel, v_frame_imp,
                       v_ang_cad, v_ang_rod, v_ang_tob, v_estab_t, v_clasif,
                       v_curvas, v_landmarks, v_alertas,
                       v_video, v_video_nombre, v_video_mime;
        IF done = 1 THEN LEAVE bucle; END IF;

        INSERT INTO gestos (id_usuario, modulo, fecha, metodo_origen, confianza_ia)
        VALUES (v_id_usuario, 'futbol', v_fecha, v_metodo, v_confianza);
        SET v_id_nuevo = LAST_INSERT_ID();

        INSERT INTO gestos_futbol
            (id_gesto, pierna_golpeo, pierna_apoyo, velocidad_pie_ms, frame_impacto,
             angulo_cadera_deg, angulo_rodilla_deg, angulo_tobillo_deg,
             estabilidad_tronco, clasificacion)
        VALUES
            (v_id_nuevo,
             COALESCE(v_pierna_g, 'desconocida'),
             COALESCE(v_pierna_a, 'desconocida'),
             v_vel, v_frame_imp, v_ang_cad, v_ang_rod, v_ang_tob,
             v_estab_t, v_clasif);

        IF v_curvas IS NOT NULL OR v_landmarks IS NOT NULL THEN
            INSERT INTO gestos_curvas (id_gesto, curvas_json, landmarks_json)
            VALUES (v_id_nuevo, v_curvas, v_landmarks);
        END IF;

        -- Desnormalizar alertas_json -> filas en gestos_alertas
        IF v_alertas IS NOT NULL AND JSON_TYPE(v_alertas) = 'ARRAY' THEN
            INSERT INTO gestos_alertas (id_gesto, codigo, severidad, mensaje)
            SELECT v_id_nuevo,
                   COALESCE(jt.codigo, 'desconocido'),
                   COALESCE(jt.severidad, 'media'),
                   COALESCE(jt.mensaje, '')
            FROM JSON_TABLE(
                v_alertas,
                '$[*]' COLUMNS (
                    codigo    VARCHAR(50)  PATH '$.codigo',
                    severidad VARCHAR(10)  PATH '$.severidad',
                    mensaje   TEXT         PATH '$.mensaje'
                )
            ) jt;
        END IF;

        IF v_video IS NOT NULL THEN
            INSERT INTO gestos_videos (id_gesto, video_blob, video_nombre, video_mime)
            VALUES (v_id_nuevo, v_video, v_video_nombre, v_video_mime);
        END IF;

        INSERT INTO map_golpeos VALUES (v_id_old, v_id_nuevo);
    END LOOP;
    CLOSE cur;
END //
DELIMITER ;

CALL _migrar_golpeos();
DROP PROCEDURE _migrar_golpeos;

-- ── Paso 6. Reconstruir sesiones a partir de la heuristica 2h ─
-- Una sesion = secuencia de gestos del mismo usuario + modulo
-- separados por <= 2h. Util para mantener compatibilidad analitica.
DELIMITER //
DROP PROCEDURE IF EXISTS _reconstruir_sesiones //
CREATE PROCEDURE _reconstruir_sesiones()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_id_gesto INT;
    DECLARE v_id_usuario INT;
    DECLARE v_modulo VARCHAR(10);
    DECLARE v_fecha DATETIME;
    DECLARE v_last_user INT DEFAULT NULL;
    DECLARE v_last_modulo VARCHAR(10) DEFAULT NULL;
    DECLARE v_last_fecha DATETIME DEFAULT NULL;
    DECLARE v_id_sesion INT DEFAULT NULL;

    DECLARE cur CURSOR FOR
        SELECT id_gesto, id_usuario, modulo, fecha
        FROM gestos
        ORDER BY id_usuario, modulo, fecha;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    bucle: LOOP
        FETCH cur INTO v_id_gesto, v_id_usuario, v_modulo, v_fecha;
        IF done = 1 THEN LEAVE bucle; END IF;

        IF v_last_user IS NULL
           OR v_last_user <> v_id_usuario
           OR v_last_modulo <> v_modulo
           OR TIMESTAMPDIFF(MINUTE, v_last_fecha, v_fecha) > 120 THEN
            -- nueva sesion
            INSERT INTO sesiones (id_usuario, modulo, fecha_inicio, fecha_fin)
            VALUES (v_id_usuario, v_modulo, v_fecha, v_fecha);
            SET v_id_sesion = LAST_INSERT_ID();
        ELSE
            UPDATE sesiones SET fecha_fin = v_fecha WHERE id_sesion = v_id_sesion;
        END IF;

        UPDATE gestos SET id_sesion = v_id_sesion WHERE id_gesto = v_id_gesto;

        SET v_last_user   = v_id_usuario;
        SET v_last_modulo = v_modulo;
        SET v_last_fecha  = v_fecha;
    END LOOP;
    CLOSE cur;
END //
DELIMITER ;

CALL _reconstruir_sesiones();
DROP PROCEDURE _reconstruir_sesiones;

-- ── Paso 7. Verificacion ──────────────────────────────────────
SELECT
    (SELECT COUNT(*) FROM bd_anim3d_saltos.usuarios)        AS usuarios_origen,
    (SELECT COUNT(*) FROM bd_anim3d_saltos.usuarios_futbol) AS usuarios_futbol_origen,
    (SELECT COUNT(*) FROM usuarios)                         AS usuarios_destino,
    (SELECT COUNT(*) FROM bd_anim3d_saltos.saltos)          AS saltos_origen,
    (SELECT COUNT(*) FROM v_saltos)                         AS saltos_destino,
    (SELECT COUNT(*) FROM bd_anim3d_saltos.golpes_futbol)   AS golpeos_origen,
    (SELECT COUNT(*) FROM v_golpeos)                        AS golpeos_destino,
    (SELECT COUNT(*) FROM sesiones)                         AS sesiones_creadas;

-- ── Paso 8. Añadir columnas nuevas a gestos_futbol (idempotente) ──────────
-- Ejecutar si la BD ya existía antes de init_db_unificada.sql v2.
ALTER TABLE gestos_futbol
    ADD COLUMN IF NOT EXISTS asimetria_postura_pct DECIMAL(6,2) NULL,
    ADD COLUMN IF NOT EXISTS score_compuesto       DECIMAL(5,1) NULL;
