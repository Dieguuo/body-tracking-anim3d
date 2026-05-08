"""
SERVICIO — Organizacion de videos guardados para la biblioteca web.

Clasifica videos en:
- Individuales
- Comparativas (grupos de 4 en una sesion)
"""

from __future__ import annotations

from datetime import datetime

from utils.session_utils import to_datetime as _to_datetime, agrupar_sesiones

TAMANO_GRUPO_COMPARATIVA = 4


def _serializar_video(video: dict) -> dict:
    fecha = _to_datetime(video.get("fecha_golpeo"))
    return {
        "id_golpeo": video.get("id_golpeo"),
        "id_usuario": video.get("id_usuario"),
        "alias": video.get("alias"),
        "pierna_golpeo": video.get("pierna_golpeo"),
        "pierna_apoyo": video.get("pierna_apoyo"),
        "angulo_rodilla_deg": float(video["angulo_rodilla_deg"]) if video.get("angulo_rodilla_deg") is not None else None,
        "angulo_cadera_deg": float(video["angulo_cadera_deg"]) if video.get("angulo_cadera_deg") is not None else None,
        "angulo_tobillo_deg": float(video["angulo_tobillo_deg"]) if video.get("angulo_tobillo_deg") is not None else None,
        "confianza": float(video["confianza"]) if video.get("confianza") is not None else None,
        "metodo_origen": video.get("metodo_origen"),
        "fecha_golpeo": fecha.isoformat() if fecha else None,
        "video_nombre": video.get("video_nombre"),
        "video_mime": video.get("video_mime"),
        "tamano_bytes": int(video.get("tamano_bytes") or 0),
    }


def _agrupar_sesiones(videos_asc: list[dict]) -> list[list[dict]]:
    return agrupar_sesiones(videos_asc, campo_fecha="fecha_golpeo")


def clasificar_videos(videos: list[dict]) -> dict:
    """
    Separa videos individuales y grupos de comparativa.

    Regla de comparativa:
    - Misma sesion (registros consecutivos separados <= 2 horas)
    - Se crean grupos de 4 videos en orden cronologico
    """
    if not videos:
        return {
            "individuales": [],
            "comparativas": [],
        }

    por_usuario: dict[int, list[dict]] = {}
    for video in videos:
        id_usuario = int(video.get("id_usuario") or 0)
        por_usuario.setdefault(id_usuario, []).append(video)

    individuales: list[dict] = []
    comparativas: list[dict] = []

    for (_id_usuario, items) in por_usuario.items():
        items_asc = sorted(items, key=lambda v: _to_datetime(v.get("fecha_golpeo")) or datetime.min)
        sesiones = _agrupar_sesiones(items_asc)

        for sesion in sesiones:
            if len(sesion) < TAMANO_GRUPO_COMPARATIVA:
                individuales.extend(_serializar_video(v) for v in sesion)
                continue

            for start in range(0, len(sesion), TAMANO_GRUPO_COMPARATIVA):
                bloque = sesion[start:start + TAMANO_GRUPO_COMPARATIVA]
                if len(bloque) == TAMANO_GRUPO_COMPARATIVA:
                    inicio = _to_datetime(bloque[0].get("fecha_golpeo"))
                    fin = _to_datetime(bloque[-1].get("fecha_golpeo"))
                    comparativas.append({
                        "grupo_id": f"{bloque[0].get('id_usuario')}-{bloque[0].get('id_golpeo')}",
                        "id_usuario": bloque[0].get("id_usuario"),
                        "alias": bloque[0].get("alias"),
                        "fecha_inicio": inicio.isoformat() if inicio else None,
                        "fecha_fin": fin.isoformat() if fin else None,
                        "total_videos": len(bloque),
                        "videos": [_serializar_video(v) for v in bloque],
                    })
                else:
                    individuales.extend(_serializar_video(v) for v in bloque)

    individuales.sort(key=lambda v: v.get("fecha_golpeo") or "", reverse=True)
    comparativas.sort(key=lambda g: g.get("fecha_inicio") or "", reverse=True)

    return {
        "individuales": individuales,
        "comparativas": comparativas,
    }
