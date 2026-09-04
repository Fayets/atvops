# ATV Ops — frontend

Dashboard interno de operaciones y sistemas de ATV. React + Vite (JavaScript).

Cuatro áreas: **Fulfillment**, **Marketing**, **Ventas** y **Sistemas**, con una
home que las une. Fulfillment se construye sobre los transcripts de Discord: cada
cliente tiene un score de salud calculado desde su canal, sin formularios.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

## Mapa

```text
src/
  data/            Contrato de datos y frontera con el backend
    types.js       Tipos JSDoc: la forma de todo lo que se muestra
    sources.js     Fuentes (Discord/CRM, Ads Manager, Calendly, payments) e inventario de campos
    api.js         Única puerta de entrada de datos. Hoy mocks, mañana fetch
    mock/          Datos de ejemplo por dominio
  components/
    layout/        Shell, sidebar, topbar
    ui/            Card, KpiCard, DataTable, Stepper, Pill, SourceTag…
    charts/        Gráficos SVG propios: LineArea, Bars, HBars, Sparkline, Ring,
                   Waterfall (puente de NRR), Heatmap, StackedBar
    home/          Paneles de grietas, pedidos de datos y resumen por área
    fulfillment/   ClienteCard, PanelScore, Señales
  pages/           Home, Marketing, Ventas, Sistemas
    fulfillment/   Resumen, Clientes, ficha de cliente, los seis pilares y
                   Transcripts (datos reales del bot de Discord)
  lib/             Formateo, hooks y scoring.js (score de salud del cliente)
  styles/          tokens.css (paleta y métrica) + app.css (componentes)
```

El backend corre aparte:

```bash
cd ../backend && .venv/bin/python -m uvicorn main:app --reload --port 8010
```

Sirve `/api/transcripts`, que lee los `.txt` del bot de Discord de ATV Clients.
El frontend lo toma de `VITE_API_URL` (default `http://localhost:8010`).

Para conectar una fuente real, ver `../docs/atv-ops-dashboard.md`.
