-- ============================================================
-- Script de inicialización — bd_anim3d_saltos
-- Ejecutar una sola vez:  mysql -u root -p < init_db.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS bd_anim3d_saltos
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE bd_anim3d_saltos;

-- ── Tabla de usuarios ──

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario  INT           AUTO_INCREMENT PRIMARY KEY,
    alias       VARCHAR(50)   NOT NULL UNIQUE,
    nombre_completo VARCHAR(120) NOT NULL,
    altura_m    DECIMAL(4,2)  NOT NULL,
    peso_kg     DECIMAL(5,1)  NULL,
    fecha_registro DATETIME   DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── Tabla de saltos ──

CREATE TABLE IF NOT EXISTS saltos (
    id_salto      INT           AUTO_INCREMENT PRIMARY KEY,
    id_usuario    INT           NOT NULL,
    tipo_salto    ENUM('vertical','horizontal') NOT NULL,
    distancia_cm  INT           NOT NULL,
    tiempo_vuelo_s DECIMAL(6,3) NULL,
    confianza_ia  DECIMAL(4,3)  NULL,
    potencia_w    DECIMAL(8,2)  NULL,
    asimetria_pct DECIMAL(6,2)  NULL,
    angulo_rodilla_deg DECIMAL(6,2) NULL,
    angulo_cadera_deg  DECIMAL(6,2) NULL,
    estabilidad_aterrizaje JSON      NULL,
    curvas_json           JSON      NULL,
    metodo_origen ENUM('ia_vivo','video_galeria','sensor_arduino') DEFAULT 'video_galeria',
    fecha_salto   DATETIME      DEFAULT CURRENT_TIMESTAMP,

    -- Columnas para almacenamiento de vídeo (LONGBLOB)
    video_blob    LONGBLOB      NULL,
    video_nombre  VARCHAR(255)  NULL,
    video_mime    VARCHAR(100)  NULL,

    CONSTRAINT fk_salto_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Índice para consultas por usuario ──

CREATE INDEX IF NOT EXISTS idx_saltos_usuario ON saltos(id_usuario);

-- ── Migración: añadir peso_kg si no existe (entornos ya desplegados) ──

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'bd_anim3d_saltos' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'peso_kg');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE usuarios ADD COLUMN peso_kg DECIMAL(5,1) NULL AFTER altura_m',
    'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── Migraciones: columnas avanzadas de saltos (analítica fase 9/10) ──

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saltos' AND COLUMN_NAME = 'potencia_w'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE saltos ADD COLUMN potencia_w DECIMAL(8,2) NULL AFTER confianza_ia',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saltos' AND COLUMN_NAME = 'asimetria_pct'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE saltos ADD COLUMN asimetria_pct DECIMAL(6,2) NULL AFTER potencia_w',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saltos' AND COLUMN_NAME = 'angulo_rodilla_deg'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE saltos ADD COLUMN angulo_rodilla_deg DECIMAL(6,2) NULL AFTER asimetria_pct',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saltos' AND COLUMN_NAME = 'angulo_cadera_deg'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE saltos ADD COLUMN angulo_cadera_deg DECIMAL(6,2) NULL AFTER angulo_rodilla_deg',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saltos' AND COLUMN_NAME = 'estabilidad_aterrizaje'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE saltos ADD COLUMN estabilidad_aterrizaje JSON NULL AFTER angulo_cadera_deg',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migrar estabilidad_aterrizaje de DECIMAL a JSON si necesario
SET @col_type = (
    SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saltos' AND COLUMN_NAME = 'estabilidad_aterrizaje'
);
SET @sql = IF(@col_type = 'decimal',
    'ALTER TABLE saltos MODIFY COLUMN estabilidad_aterrizaje JSON NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migración: añadir curvas_json (Fase 8.2 — comparación de intentos)
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saltos' AND COLUMN_NAME = 'curvas_json'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE saltos ADD COLUMN curvas_json JSON NULL AFTER estabilidad_aterrizaje',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
