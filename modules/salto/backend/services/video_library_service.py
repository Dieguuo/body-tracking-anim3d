"""
SERVICIO — Organización de vídeos guardados para la biblioteca web.

Clasifica vídeos en:
- Individuales
- Comparativas (grupos de 4 saltos dentro de una sesión)
"""

from __future__ import annotations

from datetime import datetime, timedelta

VENTANA_SESION_HORAS = 2
TAMANO_GRUPO_COMPARATIVA = 4


def _to_datetime(value) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _serializar_video(video: dict) -> dict:
    fecha = _to_datetime(video.get("fecha_salto"))
    return {
        "id_salto": video.get("id_salto"),
        "id_usuario": video.get("id_usuario"),
        "alias": video.get("alias"),
        "tipo_salto": video.get("tipo_salto"),
        "distancia_cm": video.get("distancia_cm"),
        "tiempo_vuelo_s": float(video["tiempo_vuelo_s"]) if video.get("tiempo_vuelo_s") is not None else None,
        "metodo_origen": video.get("metodo_origen"),
        "fecha_salto": fecha.isoformat() if fecha else None,
        "video_nombre": video.get("video_nombre"),
        "video_mime": video.get("video_mime"),
        "tamano_bytes": int(video.get("tamano_bytes") or 0),
    }


def _agrupar_sesiones(videos_asc: list[dict]) -> list[list[dict]]:
    if not videos_asc:
        return []

    sesiones: list[list[dict]] = []
    actual: list[dict] = []
    ultimo_dt: datetime | None = None
    margen = timedelta(hours=VENTANA_SESION_HORAS)

    for video in videos_asc:
        dt = _to_datetime(video.get("fecha_salto"))
        if dt is None:
            continue

        if not actual:
            actual = [video]
            ultimo_dt = dt
            continue

        if ultimo_dt is not None and (dt - ultimo_dt) <= margen:
            actual.append(video)
        else:
            sesiones.append(actual)
            actual = [video]

        ultimo_dt = dt

    if actual:
        sesiones.append(actual)

    return sesiones


def clasificar_videos(videos: list[dict]) -> dict:
    """
    Separa vídeos individuales y grupos de comparativa.

    Regla de comparativa:
    - Misma sesión (saltos consecutivos separados <= 2 horas)
    - Se crean grupos de 4 vídeos en orden cronológico
    """
    if not videos:
        return {
            "individuales": [],
            "comparativas": [],
        }

    por_usuario_tipo: dict[tuple[int, str], list[dict]] = {}
    for video in videos:
        id_usuario = int(video.get("id_usuario") or 0)
        tipo = str(video.get("tipo_salto") or "").lower()
        key = (id_usuario, tipo)
        por_usuario_tipo.setdefault(key, []).append(video)

    individuales: list[dict] = []
    comparativas: list[dict] = []

    for (_id_usuario, _tipo), items in por_usuario_tipo.items():
        items_asc = sorted(items, key=lambda v: _to_datetime(v.get("fecha_salto")) or datetime.min)
        sesiones = _agrupar_sesiones(items_asc)

        for sesion in sesiones:
            if len(sesion) < TAMANO_GRUPO_COMPARATIVA:
                individuales.extend(_serializar_video(v) for v in sesion)
                continue

            # Dividir la sesión en bloques de 4 para identificar comparativas.
            for start in range(0, len(sesion), TAMANO_GRUPO_COMPARATIVA):
                bloque = sesion[start:start + TAMANO_GRUPO_COMPARATIVA]
                if len(bloque) == TAMANO_GRUPO_COMPARATIVA:
                    inicio = _to_datetime(bloque[0].get("fecha_salto"))
                    fin = _to_datetime(bloque[-1].get("fecha_salto"))
                    comparativas.append({
                        "grupo_id": f"{bloque[0].get('id_usuario')}-{bloque[0].get('tipo_salto')}-{bloque[0].get('id_salto')}",
                        "id_usuario": bloque[0].get("id_usuario"),
                        "alias": bloque[0].get("alias"),
                        "tipo_salto": bloque[0].get("tipo_salto"),
                        "fecha_inicio": inicio.isoformat() if inicio else None,
                        "fecha_fin": fin.isoformat() if fin else None,
                        "total_videos": len(bloque),
                        "videos": [_serializar_video(v) for v in bloque],
                    })
                else:
                    individuales.extend(_serializar_video(v) for v in bloque)

    individuales.sort(key=lambda v: v.get("fecha_salto") or "", reverse=True)
    comparativas.sort(key=lambda g: g.get("fecha_inicio") or "", reverse=True)

    return {
        "individuales": individuales,
        "comparativas": comparativas,
    }
