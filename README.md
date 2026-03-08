# BLE Bike Trainer

Aplicación web para conectar y controlar bicicletas de entrenamiento compatibles con Bluetooth Low Energy (BLE). Diseñada específicamente para bicicletas Bodytone DS60, aunque puede funcionar con otros dispositivos que implementen el servicio Fitness Machine (FTMS).

## Características

- **Conexión Bluetooth**: Conecta directamente con tu bicicleta mediante el navegador web
- **Métricas en tiempo real**:
  - Velocidad (km/h)
  - Cadencia (rpm)
  - Potencia (vatios)
  - Nivel de resistencia
- **Control de resistencia**: 32 niveles de dureza ajustables directamente desde la interfaz
- **Temporizador**: Control de tiempo de entrenamiento con inicio, pausa y reset
- **Estadísticas avanzadas**:
  - Distancia recorrida
  - Calorías quemadas
  - Potencia media y máxima
  - Velocidad y cadencia medias

## Requisitos del Navegador

Esta aplicación utiliza la **Web Bluetooth API**, que está disponible únicamente en navegadores Chromium. Los navegadores soportados son:

- **Google Chrome** (versión 56 o superior)
- **Microsoft Edge** (versión 79 o superior)
- **Opera** (versión 43 o superior)
- **Brave** (versión 1.0 o superior)

> **Nota**: Firefox, Safari y otros navegadores NO soportan la Web Bluetooth API de forma nativa.

## Configuración del Navegador

Antes de usar la aplicación, debes habilitar y configurar Bluetooth en el navegador:

### Chrome / Edge

1. **Habilitar el flag de Bluetooth**:
   - Abre una nueva pestaña y escribe: `chrome://flags`
   - Busca: `#enable-experimental-web-platform-features`
   - Cámbiala a: **Enabled**
   - Busca también: `#enable-web-bluetooth`
   - Cámbiala a: **Enabled**

2. **Permitir acceso Bluetooth**:
   - Ve a: `chrome://settings/content/bluetooth`
   - O en Configuración > Privacidad y seguridad > Permisos del sitio > Bluetooth
   - Asegúrate de que tu sitio/localhost tenga permitido el acceso

3. **Configuración de HTTPS**:
   - La Web Bluetooth API **SOLO funciona en HTTPS** o en `localhost`
   - Si ejecutas la aplicación desde un servidor local, usa `http://localhost`
   - Si la subes a un servidor, debe tener certificado HTTPS

### Solución de problemas comunes

| Error | Solución |
|-------|----------|
| "Web Bluetooth API no está disponible" | Usa Chrome/Edge y habilita los flags experimentales |
| "No se encuentran dispositivos" | Verifica que la bicicleta esté encendida y en modo pairing |
| "Error de conexión" | Asegúrate de tener permisos de Bluetooth en el sistema operativo |
| "Permission denied" | Configura los permisos en `chrome://settings/content/bluetooth` |

## Uso

1. Abre el archivo `index.html` en Chrome o Edge (o sírvelo desde un servidor local)
2. Haz clic en **"Conectar Bicicleta"**
3. Selecciona tu dispositivo de la lista de dispositivos Bluetooth encontrados
4. Una vez conectado, las métricas se actualizarán automáticamente
5. Usa los botones o el slider para ajustar el nivel de resistencia

## Origen del Proyecto

Esta aplicación está basada en un proyecto anterior creado por **Pepe Lluyot** con **IONIC**. La versión actual ha sido reimplementada utilizando vanilla JavaScript y la Web Bluetooth API nativa del navegador, eliminando la dependencia de frameworks y permitiendo una ejecución más ligera y directa.

## Estructura del Proyecto

```
ble/
├── index.html   # Interfaz de usuario
├── app.js       # Lógica de la aplicación y BLE
└── README.md    # Este archivo
```

## Tecnologías Utilizadas

- **HTML5/CSS3** - Interfaz responsiva
- **JavaScript (ES6+)** - Lógica de la aplicación
- **Web Bluetooth API** - Comunicación con la bicicleta
- **Fitness Machine Service (FTMS)** - Protocolo estándar BLE para equipos de fitness

## Notas Técnicas

### UUIDs utilizados

- **Servicio**: `00001826-0000-1000-8000-00805f9b34fb` (Fitness Machine Service)
- **Característica de notificaciones**: `00002ad2-0000-1000-8000-00805f9b34fb` (RSC Measurement)
- **Característica de escritura**: `00002ad9-0000-1000-8000-00805f9b34fb` (Fitness Machine Control Point)

### Compatibilidad

Esta aplicación ha sido probada con:
- Bodytone DS60

Puede funcionar con otras bicicletas que implementen el protocolo FTMS estándar, pero los comandos de resistencia pueden variar.

## Licencia

Este proyecto es de uso educativo y personal.

---

**BLE Bike Trainer** - Pepe Lluyot.
