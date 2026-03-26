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
