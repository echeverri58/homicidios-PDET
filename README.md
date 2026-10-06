# 🛡️ Observatorio de Homicidios · PDET Colombia

Dashboard analítico **interactivo, responsive y sin dependencias** para explorar los homicidios registrados en
municipios **PDET** (Programas de Desarrollo con Enfoque Territorial) de Colombia entre **2003 y 2026**.

Incluye **un Top 10 por cada variable de cada columna** del dataset, KPIs, series temporales,
patrón semanal, comparativo departamental, tabla ordenable con exportación a CSV y lectura
automática de hallazgos.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Sin dependencias](https://img.shields.io/badge/dependencias-0-success)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-blue)

---

## 👤 Autoría

| | |
|---|---|
| **Creado por** | **John A. Echeverry O.** — Analista de Datos |
| **Correo** | [echeverri58@gmail.com](mailto:echeverri58@gmail.com) |
| **Celular** | [+57 321 746 6359](tel:+573217466359) |
| **Creado por solicitud de** | **Mauricio García** |

> Tablero desarrollado por **John A. Echeverry O.** (Analista de Datos) a solicitud de su amigo
> **Mauricio García**, con el propósito de analizar de forma clara e interactiva la violencia homicida
> en los municipios PDET de Colombia.

---

## 📚 Fuente de los datos

Los datos provienen de dos conjuntos publicados en el **Portal de Datos Abiertos de Colombia**
(`datos.gov.co`) y se combinaron en un solo archivo analítico (`homicidios_pdet.csv`):

**1. HOMICIDIO** — registros de hechos de homicidio a nivel nacional.
🔗 <https://www.datos.gov.co/Seguridad-y-Defensa/HOMICIDIO/m8fd-ahd9/explore/query/SELECT%0A%20%20%60fecha_hecho%60%2C%0A%20%20%60cod_depto%60%2C%0A%20%20%60departamento%60%2C%0A%20%20%60cod_muni%60%2C%0A%20%20%60municipio%60%2C%0A%20%20%60zona%60%2C%0A%20%20%60sexo%60%2C%0A%20%20%60arma_medio%60%2C%0A%20%20%60_modalidad_presunta%60%2C%0A%20%20%60spoa_caracterizacion%60%2C%0A%20%20%60cantidad%60%0AORDER%20BY%20%60fecha_hecho%60%20DESC%20NULL%20LAST/page/filter>

**2. Municipios PDET** — listado oficial de los municipios de Programas de Desarrollo con Enfoque Territorial,
usado como filtro territorial.
🔗 <https://www.datos.gov.co/Agricultura-y-Desarrollo-Rural/Municipios-PDET/idrk-ba8y/explore/query/SELECT%0A%20%20%60cod_subreg%60%2C%0A%20%20%60nom_subreg%60%2C%0A%20%20%60cod_depto%60%2C%0A%20%20%60nom_depto%60%2C%0A%20%20%60cod_muni%60%2C%0A%20%20%60nom_muni%60/page/filter>

### 🔗 Cómo se construyó el archivo analizado

1. Se descargó el conjunto **HOMICIDIO** con las columnas
   `fecha_hecho`, `cod_depto`, `departamento`, `cod_muni`, `municipio`, `zona`, `sexo`, `arma_medio`,
   `_modalidad_presunta`, `spoa_caracterizacion` y `cantidad`.
2. Se descargó el listado **Municipios PDET** con
   `cod_subreg`, `nom_subreg`, `cod_depto`, `nom_depto`, `cod_muni` y `nom_muni`.
3. Se **cruzaron ambos conjuntos por `cod_depto` + `cod_muni`** para conservar únicamente los hechos
   ocurridos en **municipios PDET**. El resultado de ese filtro es `homicidios_pdet.csv`
   (**70.939 filas · 71.304 víctimas · 19 departamentos · 168 municipios · 2003–2026**), que es la única
   entrada del dashboard.

> Los derechos sobre los datos pertenecen a sus publicadores originales en `datos.gov.co`; este proyecto
> solo los filtra, agrega y visualiza.

---

## ✨ Características

| | |
|---|---|
| 📊 **Top 10 por cada variable** | Rankings automáticos de las 11 columnas: año, departamento, municipio, zona, sexo, arma, modalidad, familia de arma, agrupación de modalidad y clasificación SPOA. |
| 📈 **Evolución temporal** | Serie anual y mensual (2003–2026) con área suavizada y filtrado al tocar un punto. |
| 🗓️ **Estacionalidad** | Distribución por mes calendario, día de la semana y día del mes. |
| 🔍 **Filtros cruzados** | Departamento, rango de años, sexo, zona, arma, modalidad, clasificación SPOA y búsqueda de municipio. Todos los gráficos se recalculan en vivo (≈20 ms). |
| 🎯 **Filtrado desde el gráfico** | Toca cualquier barra, punto o fila de ranking para filtrar el tablero por ese valor. |
| 🧮 **Métricas derivadas** | Promedios por año/mes/día, porcentaje de feminicidios, uso de arma de fuego, proporción rural/urbana e índice relativo por 100.000 habitantes. |
| 📱 **Mobile-first** | Navegación inferior, panel de filtros desplegable, tablas con scroll táctil y gráficos Retina-aware. |
| 🌗 **Tema claro y oscuro** | Alternable y con contraste cuidado para lectura prolongada. |
| 📤 **Exportación** | Descarga en CSV del detalle por departamento (compatible con Excel en español). |
| ♿ **Accesibilidad** | Navegación por teclado, roles ARIA, `aria-live`, foco visible y soporte de `prefers-reduced-motion`. |
| 📦 **Cero dependencias** | Gráficos dibujados con Canvas 2D propio. No usa CDN, ni frameworks, ni build step para el frontend. |

---

## 🚀 Inicio rápido

El navegador bloquea `fetch()` sobre `file://`, por lo que se necesita un servidor local.

```bash
# Opción 1 — servidor incluido (Node 18+), sin instalar nada
node tools/serve.js          # http://localhost:8080

# Opción 2 — npm
npm start

# Opción 3 — cualquier servidor estático
python -m http.server 8080
npx serve .
```

Abre <http://localhost:8080> en el navegador.

### Regenerar los datasets

```bash
npm run build:data     # lee homicidios_pdet.csv y reescribe data/
npm run verify         # 58 comprobaciones: referencias + motor de datos + integración
```

---

## 📁 Estructura del proyecto

```
.
├── index.html                  # Shell de la aplicación (accesible, con ARIA)
├── manifest.webmanifest        # Metadatos PWA
├── css/
│   └── styles.css              # Design system: tokens, layout, componentes
├── js/
│   ├── app.js                  # Orquestador: carga, filtros, eventos, render
│   ├── data.js                 # Carga de datasets + motor de consulta
│   ├── charts.js               # Motor de gráficos Canvas 2D (líneas, barras, dona)
│   ├── ui.js                   # Construcción del DOM: KPIs, rankings, tabla
│   ├── utils.js                # Formato es-CO, helpers de DOM y CSV
│   └── package.json            # Marca la carpeta como ESM para las pruebas en Node
├── assets/
│   └── favicon.svg
├── data/
│   ├── dataset.json            # Bundle pre-agregado (~144 KB)
│   └── records.csv             # Registros codificados por índices (~1,9 MB)
├── tools/
│   ├── build-data.js           # Generador de datasets
│   ├── serve.js                # Servidor estático de desarrollo
│   ├── verify.js               # Pruebas del motor de datos
│   ├── verify-render.js        # Pruebas de integración del dashboard
│   ├── verify-refs.js          # Coherencia de selectores y CSS
│   └── dom-shim.js             # DOM + Canvas mínimos para probar en Node
└── homicidios_pdet.csv         # Fuente original
```

### Cómo funciona el rendimiento

Cargar 70.939 filas en un móvil sería lento, así que el build genera **dos artefactos complementarios**:

1. **`data/dataset.json`** — agregados listos para pintar (Top 10 de cada variable, series y distribuciones).
   Permite el **primer render instantáneo**.
2. **`data/records.csv`** — los 70.939 registros codificados por índices (`año|mes|día|depto|muni|…`),
   con diccionarios en la cabecera. Se descarga en segundo plano y habilita el **filtrado cruzado en vivo**
   sobre el conjunto completo, sin depender de agregados precalculados.

Con los índices y el arreglo tipado (`Int32Array`), cada consulta recorre el dataset completo en ~20 ms.

---

## 📊 Variables analizadas

| Columna del CSV | Tratamiento en el dashboard |
|---|---|
| `FECHA HECHO` | Serie anual, serie mensual, mes calendario, día de la semana, día del mes, Top 10 de años |
| `COD_DEPTO` / `DEPARTAMENTO` | Ranking, comparativo, tabla de detalle, índice por 100.000 hab. |
| `COD_MUNI` / `MUNICIPIO` | Ranking Top 10, búsqueda, desagregación por departamento |
| `ZONA` | Dona rural/urbana + Top 10 |
| `SEXO` | Dona + Top 10 + cruce con feminicidios |
| `ARMA MEDIO` | Top 10 de las 39 categorías + agrupación en 9 familias |
| `MODALIDAD PRESUNTA` | Top 10 de las 64 categorías + agrupación temática |
| `SPOA_CARACTERIZACION` | Dona homicidio/feminicidio + Top 10 |
| `CANTIDAD` | Suma de víctimas (el dataset incluye registros con más de una víctima) |

### Agrupaciones analíticas

Para que los rankings sean legibles, el dashboard calcula dos agrupaciones derivadas:

- **Familias de arma:** arma de fuego, arma blanca, explosivos, objeto contundente, asfixia, sustancias tóxicas, sin empleo de armas, otros.
- **Grupos de modalidad:** violencia armada/conflicto, sicariato, riñas y violencia interpersonal, violencia sexual/tortura, mecanismo violento específico, otras circunstancias, no reportada.

---

## 🌐 Publicar en GitHub Pages

Repositorio: <https://github.com/echeverri58/homicidios-PDET>

```bash
git init
git add .
git commit -m "Dashboard de homicidios PDET"
git branch -M main
git remote add origin https://github.com/echeverri58/homicidios-PDET.git
git push -u origin main
```

Luego, en GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `/ (root)`** y guarda.
En unos minutos el dashboard estará en `https://echeverri58.github.io/homicidios-PDET/`.

> **Nota:** `homicidios_pdet.csv` (8,5 MB) **no** es necesario para publicar; `data/` ya contiene todo lo que el sitio consume.
> Si el repositorio debe ser liviano, puedes excluir la fuente original del control de versiones.

También se incluye un flujo de trabajo de GitHub Actions (`.github/workflows/pages.yml`) que publica el sitio
automáticamente en cada push a `main`.

---

## ⚠️ Notas metodológicas

- Las cifras provienen **íntegramente** del archivo `homicidios_pdet.csv` y pueden diferir de las estadísticas
  oficiales consolidadas por ajustes posteriores, subregistro o reclasificación.
- Los totales usan la columna `CANTIDAD` (suma de víctimas), no el conteo de filas: **70.939 filas → 71.304 víctimas**.
- El **índice por 100.000 habitantes** de la tabla de detalle es una **base analítica interna** con población
  estimada de los municipios PDET de cada departamento. **No** es una tasa oficial ni corresponde a la población
  total del departamento: sirve para comparar magnitudes relativas entre territorios.
- El año **2026** está incompleto en la fuente (los datos llegan hasta agosto); las comparaciones anuales con
  ese año no son concluyentes.
- Los registros con valores vacíos, `NO REPORTADA`, `NO REPORTA` o `SIN ESTABLECER` se conservan y se
  agrupan explícitamente para no perder volumen de casos.

---

## 🧪 Pruebas

```bash
npm run verify          # ejecuta las tres suites
npm run verify:refs     # referencias de DOM y CSS
npm run verify:data     # 33 pruebas del motor de datos
npm run verify:render   # 24 pruebas de integración
```

**Referencias** — comprueba que cada selector `#id`, `.clase` y `getElementById` usado en `js/` exista
realmente en `index.html`, que toda clase consultada por el JS tenga estilo y que las llaves del CSS cuadren.

**Motor de datos** — coherencia de totales entre rankings y series, orden descendente y límite del Top 10,
correcta decodificación de los 70.939 registros, intersección de filtros combinados, comportamiento con
conjuntos vacíos y presupuesto de rendimiento por consulta (~20 ms).

**Integración** — `tools/dom-shim.js` implementa un DOM y un Canvas 2D mínimos para ejecutar la aplicación
completa dentro de Node: carga `index.html`, arranca `js/app.js`, verifica que se pinten los KPIs, los 9 rankings,
los 8 gráficos (más de 25 operaciones de dibujo y etiquetas en cada canvas), la tabla, los hallazgos; y simula
clics reales de filtrado, búsqueda, ordenamiento de tabla, cambio de tema, exportación y tooltips.

---

## 🤝 Contribuir

1. Haz un fork y crea una rama: `git checkout -b mejora/nueva-vista`
2. Ejecuta `npm run verify` antes de abrir el Pull Request.
3. Mantén el principio de **cero dependencias** en el frontend.

---

## 📄 Licencia

Código publicado bajo **Licencia MIT** — ver [`LICENSE`](LICENSE).
Los datos conservan la licencia y condiciones de sus fuentes originales en `datos.gov.co`.

---

<div align="center">

**Observatorio de Homicidios · PDET Colombia**

Creado por **John A. Echeverry O.** — Analista de Datos
[echeverri58@gmail.com](mailto:echeverri58@gmail.com) · Cel: **321 746 6359**

Por solicitud de **Mauricio García**

</div>
