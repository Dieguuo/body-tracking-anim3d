"""
Pool de conexiones a MySQL.
"""

from mysql.connector import pooling

from config import DB_CONFIG

_pool: pooling.MySQLConnectionPool | None = None


# Crea o reutiliza el pool de conexiones MySQL.
def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="anim3d_futbol_pool",
            pool_size=10,
            pool_reset_session=True,
            **DB_CONFIG,
        )
    return _pool


class get_connection:
    # Abre una conexion y cursor con diccionarios.
    def __enter__(self):
        self.conn = _get_pool().get_connection()
        try:
            self.cursor = self.conn.cursor(dictionary=True)
        except Exception:
            self.conn.close()
            raise
        return self.conn, self.cursor

    # Confirma o revierte la transaccion y libera recursos.
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.cursor.close()
        self.conn.close()
        return False
