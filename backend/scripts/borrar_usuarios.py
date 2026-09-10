"""Borra usuarios de ATV Ops por username. Uso: python borrar_usuarios.py fede emiliano"""
import sys
sys.path.insert(0, '.')
from src.db import init_db
init_db()
from pony.orm import db_session, select
from src.models import Usuario

nombres = [n.strip().lower() for n in sys.argv[1:] if n.strip()]
if not nombres:
    print('Pasá al menos un username.'); raise SystemExit(1)

with db_session:
    for n in nombres:
        u = Usuario.get(username=n)
        if u is None:
            print(f'  {n}: no existe'); continue
        if u.reuniones or u.ideas:
            print(f'  {n}: tiene {len(u.reuniones)} reuniones y {len(u.ideas)} ideas, no se borra'); continue
        u.delete()
        print(f'  {n}: borrado')
    print('quedan:', ', '.join(sorted(x.username for x in select(x for x in Usuario))))
