/**
 * BLE Bike Trainer - Web Bluetooth API
 * Implementación para conectar con bicicleta Bodytone DS60
 */

// ============================================
// CONFIGURACIÓN DE LA BICI
// ============================================
const BIKE_CONFIG = {
    serviceUUID: '00001826-0000-1000-8000-00805f9b34fb',  // Fitness Machine Service
    notifyCharacteristic: '00002ad2-0000-1000-8000-00805f9b34fb',  // RSC Measurement
    writeCharacteristic: '00002ad9-0000-1000-8000-00805f9b34fb',  // Fitness Machine Control Point

    // Niveles de resistencia (32 niveles)
    resistanceLevels: [
        new Uint8Array([0x04, 0x00, 0x00]),
        new Uint8Array([0x04, 0x0a, 0x00]),
        new Uint8Array([0x04, 0x14, 0x00]),
        new Uint8Array([0x04, 0x1e, 0x00]),
        new Uint8Array([0x04, 0x28, 0x00]),
        new Uint8Array([0x04, 0x32, 0x00]),
        new Uint8Array([0x04, 0x3c, 0x00]),
        new Uint8Array([0x04, 0x46, 0x00]),
        new Uint8Array([0x04, 0x50, 0x00]),
        new Uint8Array([0x04, 0x5a, 0x00]),
        new Uint8Array([0x04, 0x64, 0x00]),
        new Uint8Array([0x04, 0x6e, 0x00]),
        new Uint8Array([0x04, 0x78, 0x00]),
        new Uint8Array([0x04, 0x82, 0x00]),
        new Uint8Array([0x04, 0x8c, 0x00]),
        new Uint8Array([0x04, 0x96, 0x00]),
        new Uint8Array([0x04, 0xa0, 0x00]),
        new Uint8Array([0x04, 0xaa, 0x00]),
        new Uint8Array([0x04, 0xb4, 0x00]),
        new Uint8Array([0x04, 0xbe, 0x00]),
        new Uint8Array([0x04, 0xc8, 0x00]),
        new Uint8Array([0x04, 0xd2, 0x00]),
        new Uint8Array([0x04, 0xdc, 0x00]),
        new Uint8Array([0x04, 0xe6, 0x00]),
        new Uint8Array([0x04, 0xf0, 0x00]),
        new Uint8Array([0x04, 0xfa, 0x00]),
        new Uint8Array([0x04, 0x05, 0x01]),
        new Uint8Array([0x04, 0x0f, 0x01]),
        new Uint8Array([0x04, 0x19, 0x01]),
        new Uint8Array([0x04, 0x23, 0x01]),
        new Uint8Array([0x04, 0x2d, 0x01]),
        new Uint8Array([0x04, 0x37, 0x01]),
        new Uint8Array([0x04, 0x41, 0x01])
    ]
};

// ============================================
// CLASE PRINCIPAL - BLE TRAINER
// ============================================
class BleTrainer {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.notifyCharacteristic = null;
        this.writeCharacteristic = null;

        // Datos de la bicicleta
        this.speed = 0;           // km/h
        this.cadence = 0;        // rpm
        this.power = 0;           // watios
        this.resistance = 0;      // nivel actual
        this.avgSpeed = 0;       // velocidad media

        // Estado de conexión
        this.isConnected = false;
        this.isScanning = false;

        // Flag para evitar escritura concurrente
        this.isWriting = false;

        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onDataUpdate = null;
        this.onError = null;
    }

    // ============================================
    // ESCANEAR DISPOSITIVOS
    // ============================================
    async scan() {
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth API no está disponible en este navegador');
        }

        if (this.isScanning) {
            console.log('Ya se está escaneando');
            return [];
        }

        this.isScanning = true;
        console.log('Iniciando escaneo...');

        try {
            // Filtrar solo dispositivos con el servicio de Fitness Machine
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [BIKE_CONFIG.serviceUUID] }],
                optionalServices: []
            });

            this.isScanning = false;
            return [device];

        } catch (error) {
            this.isScanning = false;
            console.error('Error escaneando:', error);
            throw error;
        }
    }

    // ============================================
    // CONECTAR AL DISPOSITIVO
    // ============================================
    async connect(device) {
        if (!device) {
            throw new Error('No se ha proporcionado un dispositivo');
        }

        console.log('Conectando a:', device.name || device.id);

        try {
            // Conectar al servidor GATT
            this.server = await device.gatt.connect();
            this.device = device;

            // Obtener el servicio
            this.service = await this.server.getPrimaryService(BIKE_CONFIG.serviceUUID);
            console.log('Servicio obtenido:', this.service.uuid);

            // Listar TODAS las características primero
            console.log('=== LISTANDO CARACTERÍSTICAS ===');
            const allChars = await this.service.getCharacteristics();
            for (const c of allChars) {
                console.log('Característica encontrada:', c.uuid);
            }
            console.log('==============================');

            // Obtener características específicas
            this.notifyCharacteristic = await this.service.getCharacteristic(BIKE_CONFIG.notifyCharacteristic);
            this.writeCharacteristic = await this.service.getCharacteristic(BIKE_CONFIG.writeCharacteristic);

            console.log('Notify char:', this.notifyCharacteristic ? this.notifyCharacteristic.uuid : 'NO ENCONTRADA');
            console.log('Write char:', this.writeCharacteristic ? this.writeCharacteristic.uuid : 'NO ENCONTRADA');

            // Suscribirse a notificaciones
            await this.startNotifications();

            // Enviar comandos de inicialización para que la bici.envíe datos
            await this.initializeBike();

            // Configurar desconexión
            device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnect();
            });

            this.isConnected = true;
            console.log('Conectado correctamente');

            if (this.onConnect) {
                this.onConnect(device);
            }

            return true;

        } catch (error) {
            console.error('Error conectando:', error);
            this.handleDisconnect();
            throw error;
        }
    }

    // ============================================
    // LISTAR TODAS LAS CARACTERÍSTICAS (para debug)
    // ============================================
    async listAllCharacteristics() {
        try {
            console.log('Listando características del servicio...');
            const characteristics = await this.service.getCharacteristics();
            console.log('Características disponibles:');
            for (const char of characteristics) {
                console.log(`  - ${char.uuid}`);
            }
        } catch (error) {
            console.error('Error listando características:', error);
        }
    }

    // ============================================
    // INICIALIZAR BICI - Enviar comandos para recibir datos
    // ============================================
    async initializeBike() {
        if (!this.writeCharacteristic) {
            console.error('No hay característica de escritura');
            return;
        }

        try {
            // Enviar señal de petición
            const cmd1 = new Uint8Array([0x00]);
            await this.writeCharacteristic.writeValue(cmd1);
            console.log('Comando 0x00 enviado');

            // Enviar señal para iniciar training
            const cmd2 = new Uint8Array([0x07]);
            await this.writeCharacteristic.writeValue(cmd2);
            console.log('Comando 0x07 enviado - Bici inicializada');

        } catch (error) {
            console.error('Error enviando comandos de inicialización:', error);
        }
    }

    // ============================================
    // SUSCRIBIRSE A NOTIFICACIONES
    // ============================================
    async startNotifications() {
        if (!this.notifyCharacteristic) {
            throw new Error('No hay característica de notificaciones');
        }

        await this.notifyCharacteristic.startNotifications();
        this.notifyCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const dataView = event.target.value;
            const buffer = dataView.buffer;
            this.handleData(buffer);
        });
    }

    // ============================================
    // MANEJO DE DATOS RECIBIDOS
    // ============================================
    handleData(buffer) {
        const data = new Uint8Array(buffer);

        // Verificar que tenemos suficientes datos
        if (data.length < 8) {
            return;
        }

        // Parsear datos según el formato de la DS60
        this.speed = (data[2] + data[3] * 256) / 100;
        this.cadence = (data[4] + data[5] * 256) / 2;
        this.avgSpeed = data[7];
        this.resistance = (data[9] + data[10] * 256) / 10;
        this.power = data[11] + data[12] * 256;

        // Notificar actualización
        if (this.onDataUpdate) {
            this.onDataUpdate({
                speed: this.speed,
                cadence: this.cadence,
                power: this.power,
                resistance: this.resistance,
                avgSpeed: this.avgSpeed
            });
        }
    }

    // ============================================
    // ESCRIBIR COMANDO (CAMBIAR NIVEL)
    // ============================================
    async setResistanceLevel(level) {
        // Si ya hay una escritura en progreso, esperar
        while (this.isWriting) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (!this.writeCharacteristic || !this.isConnected) {
            return false;
        }

        if (level < 1 || level > 32) {
            return false;
        }

        this.isWriting = true;

        try {
            // Primero 0x07, luego delay, luego el nivel
            const trainingCmd = new Uint8Array([0x07]);
            await this.writeCharacteristic.writeValueWithResponse(trainingCmd);

            // Delay
            await new Promise(resolve => setTimeout(resolve, 100));

            // Luego el nivel
            const levelData = BIKE_CONFIG.resistanceLevels[level - 1];
            await this.writeCharacteristic.writeValueWithResponse(levelData);

            return true;

        } catch (error) {
            if (this.onError) {
                this.onError(error);
            }
            return false;
        } finally {
            this.isWriting = false;
        }
    }

    // Subir nivel
    async increaseLevel() {
        if (this.resistance < 32) {
            return await this.setResistanceLevel(this.resistance + 1);
        }
        return false;
    }

    // Bajar nivel
    async decreaseLevel() {
        if (this.resistance > 1) {
            return await this.setResistanceLevel(this.resistance - 1);
        }
        return false;
    }

    // ============================================
    // DESCONECTAR
    // ============================================
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.handleDisconnect();
    }

    handleDisconnect() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.notifyCharacteristic = null;
        this.writeCharacteristic = null;

        console.log('Desconectado');

        if (this.onDisconnect) {
            this.onDisconnect();
        }
    }

    // ============================================
    // VERIFICAR CONEXIÓN
    // ============================================
    async checkConnection() {
        if (this.device && this.device.gatt.connected) {
            return true;
        }
        return false;
    }
}

// ============================================
// CONTROLADOR DEL TEMPORIZADOR
// ============================================
class Timer {
    constructor() {
        this.seconds = 0;
        this.isRunning = false;
        this.intervalId = null;

        this.onTick = null;
    }

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.seconds++;
            if (this.onTick) {
                this.onTick(this.getFormattedTime());
            }
        }, 1000);
    }

    pause() {
        if (!this.isRunning) return;

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    reset() {
        this.pause();
        this.seconds = 0;
        if (this.onTick) {
            this.onTick('00:00:00');
        }
    }

    getFormattedTime() {
        const hours = Math.floor(this.seconds / 3600);
        const minutes = Math.floor((this.seconds % 3600) / 60);
        const secs = this.seconds % 60;

        return [hours, minutes, secs]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    }

    getSeconds() {
        return this.seconds;
    }
}

// ============================================
// CONTROLADOR PRINCIPAL DE LA APLICACIÓN
// ============================================
class App {
    constructor() {
        this.bleTrainer = new BleTrainer();
        this.timer = new Timer();

        // Variables de sesión
        this.distance = 0;
        this.calories = 0;
        this.totalPower = 0;
        this.powerReadings = 0;
        this.maxPower = 0;

        // Configurar callbacks
        this.setupCallbacks();
    }

    setupCallbacks() {
        // Callback de conexión
        this.bleTrainer.onConnect = (device) => {
            this.updateConnectionStatus(true, device.name || 'Bicicleta');
        };

        // Callback de desconexión
        this.bleTrainer.onDisconnect = () => {
            this.updateConnectionStatus(false);
        };

        // Callback de datos
        this.bleTrainer.onDataUpdate = (data) => {
            this.updateDisplay(data);
        };

        // Callback del temporizador
        this.timer.onTick = (formattedTime) => {
            document.getElementById('timeValue').textContent = formattedTime;
        };
    }

    // Conexión Bluetooth
    async connectBike() {
        try {
            // Mostrar estado de escaneo
            this.updateScanningStatus(true);

            const devices = await this.bleTrainer.scan();

            if (devices.length > 0) {
                const device = devices[0];
                console.log('Dispositivo seleccionado:', device.name || device.id);

                // Verificar que el dispositivo tenga el servicio correcto
                try {
                    await this.bleTrainer.connect(device);
                } catch (error) {
                    console.error('Error al conectar con el dispositivo:', error);
                    alert('Error al conectar. Asegúrate de que el dispositivo sea compatible.');
                }
            }
        } catch (error) {
            console.error('Error en el escaneo:', error);
            if (error.name !== 'NotFoundError') {
                alert('Error: ' + error.message);
            }
        } finally {
            this.updateScanningStatus(false);
        }
    }

    updateScanningStatus(isScanning) {
        const connectBtn = document.getElementById('connectBtn');
        const statusText = document.getElementById('statusText');

        if (isScanning) {
            statusText.textContent = 'Escaneando...';
            connectBtn.disabled = true;
            connectBtn.textContent = '⏳ Buscando...';
        } else {
            connectBtn.disabled = false;
            if (!this.bleTrainer.isConnected) {
                connectBtn.textContent = '🔗 Conectar Bicicleta';
            }
        }
    }

    async disconnectBike() {
        await this.bleTrainer.disconnect();
    }

    // Control del temporizador
    startTimer() {
        this.timer.start();
    }

    pauseTimer() {
        this.timer.pause();
    }

    resetTimer() {
        this.timer.reset();
        this.resetSessionData();
    }

    // Control de resistencia
    async increaseResistance() {
        await this.bleTrainer.increaseLevel();
    }

    async decreaseResistance() {
        await this.bleTrainer.decreaseLevel();
    }

    async setResistance(level) {
        await this.bleTrainer.setResistanceLevel(level);
    }

    // Actualizar display
    updateDisplay(data) {
        // Proteger contra valores undefined
        const speed = data.speed || 0;
        const cadence = data.cadence || 0;
        const power = data.power || 0;
        const resistance = data.resistance || 0;

        // Velocidad
        document.getElementById('speedValue').textContent = speed.toFixed(1);
        document.getElementById('cadenceValue').textContent = Math.round(cadence);

        // Potencia
        document.getElementById('powerValue').textContent = power;
        const powerPercent = Math.min((power / 500) * 100, 100);
        document.getElementById('powerFill').style.width = powerPercent + '%';

        // Nivel de resistencia
        document.getElementById('resistanceValue').textContent = Math.round(resistance);
        this.updateResistanceUI(resistance);

        // Actualizar estadísticas
        this.updateSessionStats(data);
    }

    updateSessionStats(data) {
        // Calcular distancia (aproximado)
        const hours = this.timer.getSeconds() / 3600;
        this.distance = data.speed * hours;

        // Calcular potencia media
        this.totalPower += data.power;
        this.powerReadings++;
        const avgPower = Math.round(this.totalPower / this.powerReadings);

        // Potencia máxima
        if (data.power > this.maxPower) {
            this.maxPower = data.power;
        }

        // Calorías (aproximado)
        this.calories = Math.round(this.timer.getSeconds() * data.power * 0.00024);

        // Actualizar UI
        document.getElementById('distanceValue').textContent = this.distance.toFixed(2);
        document.getElementById('caloriesValue').textContent = this.calories;
        document.getElementById('avgPowerValue').textContent = avgPower;
        document.getElementById('maxPowerValue').textContent = this.maxPower + ' W';
        document.getElementById('avgSpeedValue').textContent = (data.avgSpeed || 0).toFixed(1) + ' km/h';
    }

    resetSessionData() {
        this.distance = 0;
        this.calories = 0;
        this.totalPower = 0;
        this.powerReadings = 0;
        this.maxPower = 0;

        document.getElementById('distanceValue').textContent = '0.00';
        document.getElementById('caloriesValue').textContent = '0';
        document.getElementById('avgPowerValue').textContent = '0';
        document.getElementById('maxPowerValue').textContent = '0 W';
    }

    // Actualizar estado de conexión
    updateConnectionStatus(connected, deviceName = '') {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const connectBtn = document.getElementById('connectBtn');

        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Conectado';
            connectBtn.textContent = '🔌 Desconectar';
            connectBtn.classList.remove('connect');
            connectBtn.classList.add('disconnect');
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Desconectado';
            connectBtn.textContent = '🔗 Conectar Bicicleta';
            connectBtn.classList.remove('disconnect');
            connectBtn.classList.add('connect');
        }
    }

    // Actualizar UI de resistencia
    updateResistanceUI(level) {
        const slider = document.getElementById('resistanceSlider');
        const levels = document.querySelectorAll('.resistance-level');

        const roundedLevel = Math.round(level);
        slider.value = roundedLevel;

        levels.forEach((el, index) => {
            if (index < roundedLevel) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new App();

    // Event listeners para botones de conexión
    document.getElementById('connectBtn').addEventListener('click', async () => {
        if (app.bleTrainer.isConnected) {
            await app.disconnectBike();
        } else {
            await app.connectBike();
        }
    });

    // Event listeners para temporizador
    console.log('BLE Bike Trainer inicializado');

    document.getElementById('startBtn').addEventListener('click', () => {
        app.startTimer();
    });

    document.getElementById('pauseBtn').addEventListener('click', () => {
        app.pauseTimer();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        app.resetTimer();
    });

    // Event listeners para resistencia
    document.getElementById('resistanceUp').addEventListener('click', async () => {
        const currentLevel = app.bleTrainer.resistance || 0;
        const roundedCurrent = Math.round(currentLevel);

        let newLevel;
        if (roundedCurrent >= 30) {
            newLevel = 32;
        } else {
            newLevel = Math.min(roundedCurrent + 2, 32);
        }

        await app.setResistance(newLevel);
    });

    document.getElementById('resistanceDown').addEventListener('click', async () => {
        const currentLevel = app.bleTrainer.resistance || 0;
        const roundedCurrent = Math.round(currentLevel);
        const newLevel = roundedCurrent;
        await app.setResistance(newLevel);
    });

    document.getElementById('resistanceSlider').addEventListener('input', async (e) => {
        const level = parseInt(e.target.value);
        const currentLevel = app.bleTrainer.resistance || 0;
        const currentRounded = Math.round(currentLevel);
        if (level !== currentRounded) {
            await app.setResistance(level);
            app.updateResistanceUI(level);
        }
    });
});
