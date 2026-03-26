"""
MODEL — Pool de conexiones a MySQL.

Proporciona un context manager `get_connection()` que obtiene una conexión
del pool y la devuelve al terminar (o hace rollback si hay excepción).
"""

import mysql.connector
from mysql.connector import pooling

from config import DB_CONFIG

_pool: pooling.MySQLConnectionPool | None = None


def _get_pool() -> pooling.MySQLConnectionPool:
    """Crea el pool de conexiones (lazy, una sola vez)."""
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="anim3d_pool",
            pool_size=10,
            pool_reset_session=True,
            **DB_CONFIG,
        )
    return _pool


class get_connection:
    """
    Context manager para obtener una conexión del pool.

    Uso:
        with get_connection() as (conn, cursor):
            cursor.execute("SELECT ...")
            rows = cursor.fetchall()
    """

    def __enter__(self):
        self.conn = _get_pool().get_connection()
        try:
            self.cursor = self.conn.cursor(dictionary=True)
        except Exception:
            self.conn.close()
            raise
        return self.conn, self.cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.cursor.close()
        self.conn.close()
        return False
