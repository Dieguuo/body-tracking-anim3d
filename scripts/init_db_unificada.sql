-- ============================================================
-- Esquema unificado — bd_anim3d
-- Modulos: salto + futbol comparten usuarios, sesiones, video,
-- alertas y curvas. Cada gesto se especializa por subtabla.
-- Ejecutar una sola vez en una BD limpia:
--   mysql -u root -p < init_db_unificada.sql
--
-- Para migrar desde el esquema antiguo (bd_anim3d_saltos), usar
-- despues: scripts/migrate_to_unified.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS bd_anim3d
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE bd_anim3d;

-- ── 1. Usuarios (compartido) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario      INT          AUTO_INCREMENT PRIMARY KEY,
    alias           VARCHAR(50)  NOT NULL UNIQUE,
    nombre_completo VARCHAR(120) NOT NULL,
    altura_m        DECIMAL(4,2) NOT NULL,
    peso_kg         DECIMAL(5,1) NULL,
    fecha_registro  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_usuarios_alias (alias)
) ENGINE=InnoDB;

-- ── 2. Sesiones (compartido) ──────────────────────────────────
-- Una sesion agrupa gestos consecutivos de un mismo jugador en
-- el mismo modulo. Sustituye la heuristica de 2h en runtime.
CREATE TABLE IF NOT EXISTS sesiones (
    id_sesion    INT          AUTO_INCREMENT PRIMARY KEY,
    id_usuario   INT          NOT NULL,
    modulo       ENUM('salto','futbol') NOT NULL,
    fecha_inicio DATETIME     NOT NULL,
    fecha_fin    DATETIME     NULL,
    notas        VARCHAR(255) NULL,
    INDEX idx_sesion_usuario_fecha (id_usuario, fecha_inicio),
    INDEX idx_sesion_modulo_fecha  (modulo, fecha_inicio),
    CONSTRAINT fk_sesion_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── 3. Gestos (tabla base con discriminador) ──────────────────
CREATE TABLE IF NOT EXISTS gestos (
    id_gesto      INT          AUTO_INCREMENT PRIMARY KEY,
    id_usuario    INT          NOT NULL,
    id_sesion     INT          NULL,
    modulo        ENUM('salto','futbol') NOT NULL,
    subtipo       VARCHAR(30)  NULL,
    fecha         DATETIME     DEFAULT CURRENT_TIMESTAMP,
    metodo_origen ENUM('ia_vivo','video_galeria','sensor_arduino') DEFAULT 'video_galeria',
    confianza_ia  DECIMAL(4,3) NULL,
    fps           DECIMAL(5,2) NULL,
    ancho_px      INT          NULL,
    alto_px       INT          NULL,
    INDEX idx_gestos_usuario_fecha (id_usuario, fecha),
    INDEX idx_gestos_modulo_fecha  (modulo, fecha),
    INDEX idx_gestos_sesion        (id_sesion),
    CONSTRAINT fk_gesto_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON DELETE CASCADE,
    CONSTRAINT fk_gesto_sesion
        FOREIGN KEY (id_sesion)  REFERENCES sesiones(id_sesion)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── 4. Especializacion: salto ─────────────────────────────────
CREATE TABLE IF NOT EXISTS gestos_salto (
    id_gesto                INT PRIMARY KEY,
    tipo_salto              ENUM('vertical','horizontal') NOT NULL,
    distancia_cm            INT          NOT NULL,
    tiempo_vuelo_s          DECIMAL(6,3) NULL,
    potencia_w              DECIMAL(8,2) NULL,
    asimetria_pct           DECIMAL(6,2) NULL,
    angulo_rodilla_deg      DECIMAL(6,2) NULL,
    angulo_cadera_deg       DECIMAL(6,2) NULL,
    estabilidad_aterrizaje  JSON         NULL,
    CONSTRAINT fk_salto_gesto
        FOREIGN KEY (id_gesto) REFERENCES gestos(id_gesto)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── 5. Especializacion: futbol ────────────────────────────────
CREATE TABLE IF NOT EXISTS gestos_futbol (
    id_gesto                 INT PRIMARY KEY,
    pierna_golpeo            ENUM('izquierda','derecha','desconocida') DEFAULT 'desconocida',
    pierna_apoyo             ENUM('izquierda','derecha','desconocida') DEFAULT 'desconocida',
    velocidad_pie_ms         DECIMAL(6,2) NULL,
    frame_impacto            INT          NULL,
    angulo_cadera_deg        DECIMAL(6,2) NULL,
    angulo_rodilla_deg       DECIMAL(6,2) NULL,
    angulo_tobillo_deg       DECIMAL(6,2) NULL,
    estabilidad_tronco       DECIMAL(6,2) NULL,
    oscilacion_tronco_px     DECIMAL(8,2) NULL,
    tiempo_estabilizacion_s  DECIMAL(6,3) NULL,
    asimetria_postura_pct    DECIMAL(6,2) NULL,
    score_compuesto          DECIMAL(5,1) NULL,
    clasificacion            VARCHAR(50)  NULL,
    features_version         VARCHAR(20)  NOT NULL DEFAULT 'v1',
    CONSTRAINT fk_futbol_gesto
        FOREIGN KEY (id_gesto) REFERENCES gestos(id_gesto)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── 6. Curvas, landmarks y fases (compartido, JSON pesado) ────
CREATE TABLE IF NOT EXISTS gestos_curvas (
    id_gesto         INT PRIMARY KEY,
    curvas_json      JSON NULL,
    landmarks_json   JSON NULL,
    velocidades_json JSON NULL,
    fases_json       JSON NULL,
    CONSTRAINT fk_curvas_gesto
        FOREIGN KEY (id_gesto) REFERENCES gestos(id_gesto)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── 7. Alertas normalizadas (compartido) ──────────────────────
CREATE TABLE IF NOT EXISTS gestos_alertas (
    id_alerta INT          AUTO_INCREMENT PRIMARY KEY,
    id_gesto  INT          NOT NULL,
    codigo    VARCHAR(50)  NOT NULL,
    severidad ENUM('baja','media','alta') DEFAULT 'media',
    mensaje   TEXT         NOT NULL,
    INDEX idx_alertas_gesto  (id_gesto),
    INDEX idx_alertas_codigo (codigo),
    CONSTRAINT fk_alerta_gesto
        FOREIGN KEY (id_gesto) REFERENCES gestos(id_gesto)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── 8. Videos (compartido, BLOB separado) ─────────────────────
CREATE TABLE IF NOT EXISTS gestos_videos (
    id_video     INT          AUTO_INCREMENT PRIMARY KEY,
    id_gesto     INT          NOT NULL UNIQUE,
    video_blob   LONGBLOB     NOT NULL,
    video_nombre VARCHAR(255) NULL,
    video_mime   VARCHAR(100) NULL,
    fecha_subida DATETIME     DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_video_gesto
        FOREIGN KEY (id_gesto) REFERENCES gestos(id_gesto)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── 9. Vistas de compatibilidad ───────────────────────────────
-- Permiten que el codigo existente que esperaba `id_salto` /
-- `id_golpeo` y `fecha_salto` / `fecha_golpeo` siga funcionando
-- con cambios minimos en los modelos.
CREATE OR REPLACE VIEW v_saltos AS
SELECT g.id_gesto                AS id_salto,
       g.id_usuario,
       g.id_sesion,
       g.fecha                   AS fecha_salto,
       g.metodo_origen,
       g.confianza_ia,
       g.fps,
       g.ancho_px,
       g.alto_px,
       s.tipo_salto,
       s.distancia_cm,
       s.tiempo_vuelo_s,
       s.potencia_w,
       s.asimetria_pct,
       s.angulo_rodilla_deg,
       s.angulo_cadera_deg,
       s.estabilidad_aterrizaje
FROM gestos g
JOIN gestos_salto s ON s.id_gesto = g.id_gesto
WHERE g.modulo = 'salto';

CREATE OR REPLACE VIEW v_golpeos AS
SELECT g.id_gesto                AS id_golpeo,
       g.id_usuario,
       g.id_sesion,
       g.fecha                   AS fecha_golpeo,
       g.metodo_origen,
       g.confianza_ia,
       g.confianza_ia            AS confianza,
       g.fps,
       g.ancho_px,
       g.alto_px,
       f.pierna_golpeo,
       f.pierna_apoyo,
       f.velocidad_pie_ms,
       f.frame_impacto,
       f.angulo_cadera_deg,
       f.angulo_rodilla_deg,
       f.angulo_tobillo_deg,
       f.estabilidad_tronco,
       f.oscilacion_tronco_px,
       f.tiempo_estabilizacion_s,
       f.asimetria_postura_pct,
       f.score_compuesto,
       f.clasificacion,
       f.features_version
FROM gestos g
JOIN gestos_futbol f ON f.id_gesto = g.id_gesto
WHERE g.modulo = 'futbol';
