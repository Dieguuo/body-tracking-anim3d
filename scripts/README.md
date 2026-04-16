# Scripts

## init_db.sql

Script de inicialización de la base de datos MySQL.
Crea la base de datos `bd_anim3d_saltos`, las tablas `usuarios` y `saltos`,
e incluye migraciones idempotentes para columnas añadidas en fases posteriores.

### Uso

```bash
mysql -u root -p < scripts/init_db.sql
```
