-- ============================================================
-- Migracion incremental: añadir features_version a gestos_futbol
--
-- Permite versionar el esquema de métricas extraídas por gesto
-- (ver modules/futbol/backend/config.py :: FEATURES_VERSION).
--
-- Idempotente: comprobar antes de aplicar.
-- ============================================================

-- Añadir columna si no existe
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'gestos_futbol'
      AND COLUMN_NAME  = 'features_version'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE gestos_futbol ADD COLUMN features_version VARCHAR(20) NOT NULL DEFAULT ''v1'' AFTER clasificacion',
    'SELECT ''Columna features_version ya existe — sin cambios'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill de filas previas (las que se hayan creado antes del default)
UPDATE gestos_futbol
   SET features_version = 'v1'
 WHERE features_version IS NULL OR features_version = '';

-- Recrear vista v_golpeos para incluir features_version
DROP VIEW IF EXISTS v_golpeos;
CREATE VIEW v_golpeos AS
SELECT g.id_gesto,
       g.id_usuario,
       g.id_sesion,
       g.fecha,
       g.duracion_s,
       g.notas,
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
