// ============================================
// CONFIGURACIÓN BLE
// ============================================
const BIKE_CONFIG = {
    serviceUUID: '00001826-0000-1000-8000-00805f9b34fb',
    notifyCharacteristic: '00002ad2-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '00002ad9-0000-1000-8000-00805f9b34fb',
    resistanceLevels: Array.from({ length: 32 }, (_, i) => {
        const value = (i + 1) * 10;
        return new Uint8Array([0x04, value & 0xFF, (value >> 8) & 0xFF]);
    })
};

// ============================================
// CLASE BLE TRAINER
// ============================================
class BleTrainer {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.notifyChar = null;
        this.writeChar = null;
        this.isConnected = false;
        this.onSpeedUpdate = null;
        this.onPowerUpdate = null;
    }

    async connect() {
        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [BIKE_CONFIG.serviceUUID] }]
            });
            this.server = await this.device.gatt.connect();
            this.service = await this.server.getPrimaryService(BIKE_CONFIG.serviceUUID);
            this.notifyChar = await this.service.getCharacteristic(BIKE_CONFIG.notifyCharacteristic);
            this.writeChar = await this.service.getCharacteristic(BIKE_CONFIG.writeCharacteristic);
            await this.notifyChar.startNotifications();
            this.notifyChar.addEventListener('characteristicvaluechanged', (e) => this.handleData(e));
            this.isConnected = true;
            return true;
        } catch (err) {
            console.error('BLE Error:', err);
            return false;
        }
    }

    async disconnect() {
        if (this.device?.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
    }

    handleData(event) {
        const data = new Uint8Array(event.target.value.buffer);
        if (data.length >= 10) {
            this.resistance = (data[9] + data[10] * 256) / 10;
            if (this.onSpeedUpdate) {
                this.onSpeedUpdate({ speed: ((data[4] + data[5] * 256) / 100), power: (data[7] + data[8] * 256) });
            }
        }
    }

    async setResistanceLevel(level) {
        if (!this.isConnected || !BIKE_CONFIG.resistanceLevels[level - 1]) return;
        try {
            await this.writeChar.writeValueWithResponse(BIKE_CONFIG.resistanceLevels[level - 1]);
        } catch (err) {
            console.error('Set resistance error:', err);
        }
    }
}

// ============================================
// GENERADOR DE RUTAS
// ============================================
class RouteGenerator {
    static generateRoute(distanceKm, type = 'intervals', flatLevel = 10) {
        const metersPerPoint = 50;
        const pointsPerKm = 1000 / metersPerPoint;
        const points = Math.round(distanceKm * pointsPerKm);
        const warmupPoints = Math.floor(points * 0.15);
        const cooldownPoints = Math.floor(points * 0.10);
        const mainStart = warmupPoints;
        const mainEnd = points - cooldownPoints;
        const routeData = [];
        const mainLength = mainEnd - mainStart;
        const randomSeed = Math.random();
        const varietyFactor = Math.min(1, distanceKm / 30);

        for (let i = 0; i < points; i++) {
            let resistance = flatLevel;

            if (i < warmupPoints) {
                const warmupMax = 8 + Math.floor(randomSeed * 4);
                const warmupProgress = i / warmupPoints;
                resistance = Math.floor(6 + warmupProgress * (warmupMax - 6));
            } else if (i >= mainEnd) {
                const lastMainRes = routeData[mainEnd - 1]?.resistance || flatLevel;
                const cooldownProgress = (i - mainEnd) / cooldownPoints;
                resistance = Math.floor(lastMainRes * (1 - cooldownProgress));
            } else {
                const mainIndex = i - mainStart;
                const mainProgress = mainIndex / mainLength;

                switch (type) {
                    case 'flat': {
                        const flatBase = flatLevel + Math.sin(mainIndex * 0.1) * 2;
                        const flatNoise = (Math.random() - 0.5) * 2;
                        resistance = Math.floor(flatBase + flatNoise);
                        if (Math.random() < 0.08 * varietyFactor) {
                            resistance = 14 + Math.floor(Math.random() * 4);
                        } else if (Math.random() < 0.05 * varietyFactor) {
                            resistance = Math.max(5, flatLevel - 4 + Math.floor(Math.random() * 2));
                        }
                        resistance = Math.max(5, Math.min(16, resistance));
                        break;
                    }
                    case 'intervals': {
                        const baseIntervalLen = 8 + Math.floor(varietyFactor * 6);
                        const intervalLen = baseIntervalLen + Math.floor(Math.random() * 6) - 3;
                        const intervalPhase = Math.floor(mainIndex / Math.max(6, intervalLen));
                        const isPeak = intervalPhase % 2 === 0;
                        if (isPeak) {
                            const peakMin = 18 + Math.floor(varietyFactor * 3);
                            const peakMax = 24 + Math.floor(varietyFactor * 5);
                            resistance = peakMin + Math.floor(Math.random() * (peakMax - peakMin));
                        } else {
                            if (Math.random() < 0.2 * varietyFactor) {
                                resistance = 5 + Math.floor(Math.random() * 3);
                            } else if (Math.random() < 0.3 * varietyFactor) {
                                resistance = 12 + Math.floor(Math.random() * 4);
                            } else {
                                resistance = flatLevel + (Math.random() > 0.5 ? 2 : 0);
                            }
                        }
                        break;
                    }
                    case 'mountain': {
                        const numSteps = 3 + Math.floor(varietyFactor * 3);
                        const stepSize = mainLength / numSteps;
                        const currentStep = Math.floor(mainIndex / stepSize);
                        let stepRes = 14 + currentStep * 4;
                        stepRes += Math.floor((Math.random() - 0.5) * 4);
                        const inDescent = (mainIndex % stepSize) > (stepSize * 0.65);
                        if (inDescent && Math.random() < 0.4) {
                            stepRes = Math.max(2, 6 - Math.floor(Math.random() * 4));
                        }
                        resistance = Math.max(4, Math.min(30, stepRes));
                        break;
                    }
                    case 'alps': {
                        const freq1 = 0.025 + Math.sin(mainProgress * Math.PI) * 0.015;
                        const freq2 = 0.018 + Math.cos(mainProgress * Math.PI) * 0.012;
                        const amp1 = 4 + Math.random() * 4;
                        const amp2 = 3 + Math.random() * 3;
                        const baseLevel = flatLevel + (randomSeed - 0.5) * 6;
                        const wave1 = Math.sin(mainIndex * freq1) * amp1;
                        const wave2 = Math.cos(mainIndex * freq2) * amp2;
                        resistance = Math.floor(baseLevel + wave1 + wave2);
                        if (Math.random() < 0.12 * varietyFactor) {
                            resistance += 4 + Math.floor(Math.random() * 5);
                        } else if (Math.random() < 0.1 * varietyFactor) {
                            resistance -= 2 + Math.floor(Math.random() * 3);
                        }
                        resistance = Math.max(6, Math.min(24, resistance));
                        break;
                    }
                    default:
                        resistance = flatLevel;
                }
            }

            const slope = resistance - 10;
            const elevChange = slope * 0.5;
            const prevElevation = routeData.length > 0 ? routeData[routeData.length - 1].elevation : 100;
            const elevation = prevElevation + elevChange;

            routeData.push({ resistance, slope, elevation });
        }

        return { distance: distanceKm, data: routeData, type, flatLevel };
    }
}

// ============================================
// SIMULADOR DE RUTA
// ============================================
class RouteSimulator {
    constructor() {
        this.route = null;
        this.isPlaying = false;
        this.currentIndex = 0;
        this.intervalId = null;
        this.baseSpeed = 20;
        this.flatResistance = 10;
        this.currentSpeed = 0;
        this.seconds = 0;
        this.timerInterval = null;
        this.onUpdate = null;
        this.onComplete = null;
    }

    updateSpeed(speed) {
        this.currentSpeed = speed || 0;
    }

    loadRoute(route) {
        this.route = route;
        this.currentIndex = 0;
        this.isPlaying = false;
        if (route.flatLevel) {
            this.flatResistance = route.flatLevel;
        }
        if (this.onUpdate) {
            this.onUpdate(this.getCurrentState());
        }
    }

    start() {
        if (!this.route || this.isPlaying) return;
        this.isPlaying = true;

        this.timerInterval = setInterval(() => {
            this.seconds++;
            this.updateTimerDisplay();
        }, 1000);

        this.intervalId = setInterval(() => {
            if (this.currentIndex >= this.route.data.length - 1) {
                this.stop();
                if (this.onComplete) this.onComplete();
                return;
            }

            if (this.currentSpeed > 0) {
                const distanceInSecond = this.currentSpeed / 3600;
                const distancePerPoint = this.route.distance / this.route.data.length;
                const pointsToAdvance = distanceInSecond / distancePerPoint;
                this.currentIndex += pointsToAdvance;

                if (this.currentIndex >= this.route.data.length - 1) {
                    this.currentIndex = this.route.data.length - 1;
                    this.stop();
                    if (this.onComplete) this.onComplete();
                    return;
                }
            }

            if (this.onUpdate) {
                this.onUpdate(this.getCurrentState());
            }
        }, 1000);
    }

    pause() {
        this.isPlaying = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    stop() {
        this.pause();
        this.currentIndex = 0;
        this.seconds = 0;
        this.updateTimerDisplay();
        if (this.onUpdate) {
            this.onUpdate(this.getCurrentState());
        }
    }

    updateTimerDisplay() {
        const mins = Math.floor(this.seconds / 60);
        const secs = this.seconds % 60;
        document.getElementById('currentTime').textContent =
            mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
    }

    getCurrentState() {
        if (!this.route || !this.route.data) return null;

        const dataLength = this.route.data.length;
        const indexInt = Math.floor(this.currentIndex);
        const safeIndex = Math.max(0, Math.min(indexInt, dataLength - 1));

        const pointData = this.route.data[safeIndex];
        const baseRes = pointData?.resistance || 10;
        const currentElev = pointData?.elevation || 0;

        // Ajuste dinámico basado en flatResistance actual
        const originalFlat = this.route.flatLevel || 10;
        const flatOffset = this.flatResistance - originalFlat;
        const currentRes = Math.max(1, Math.min(32, baseRes + flatOffset));
        const slope = currentRes - 10;
        const targetResistance = currentRes;

        const distanceCovered = (this.currentIndex / dataLength) * this.route.distance;

        return {
            index: safeIndex,
            distance: distanceCovered || 0,
            totalDistance: this.route.distance,
            elevation: currentElev,
            slope,
            resistance: currentRes,
            targetResistance,
            progress: (this.currentIndex / dataLength) * 100
        };
    }

    setFlatResistance(value) {
        this.flatResistance = Math.max(1, Math.min(32, value));
    }
}

// ============================================
// GRAFICADOR
// ============================================
class GraphRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.route = null;
        this.currentIndex = 0;
        this.viewMode = 'scrolling';
        this.VISIBLE_KM = 2;
        this.POSITION_PERCENT = 0.2;
        this.flatResistance = 10;
        this.originalFlatLevel = 10;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width - 32;
        this.canvas.height = 200;
        this.render();
    }

    loadRoute(route) {
        this.route = route;
        this.currentIndex = 0;
        this.flatResistance = route.flatLevel || 10;
        this.originalFlatLevel = route.flatLevel || 10;
        this.render();
    }

    setCurrentIndex(index) {
        this.currentIndex = index;
        this.render();
    }

    setFlatResistance(level) {
        this.flatResistance = level;
        this.render();
    }

    toggleViewMode() {
        this.viewMode = this.viewMode === 'scrolling' ? 'full' : 'scrolling';
        this.render();
        return this.viewMode;
    }

    getVisibleRange() {
        if (!this.route) return { start: 0, end: 0 };

        const dataLength = this.route.data.length;
        const pointsPerKm = dataLength / this.route.distance;

        if (this.viewMode === 'full') {
            return { start: 0, end: dataLength };
        }

        const visiblePoints = Math.ceil(this.VISIBLE_KM * pointsPerKm);
        let centerIndex = Math.floor(this.currentIndex);
        let startIndex = Math.floor(centerIndex - (this.POSITION_PERCENT * visiblePoints));
        let endIndex = startIndex + visiblePoints;

        if (startIndex < 0) {
            startIndex = 0;
            endIndex = Math.min(visiblePoints, dataLength);
        }
        if (endIndex > dataLength) {
            endIndex = dataLength;
            startIndex = Math.max(0, endIndex - visiblePoints);
        }

        return { start: startIndex, end: endIndex };
    }

    getResistanceColor(resistance) {
        if (resistance >= 27) return '#e74c3c';
        if (resistance >= 21) return '#f39c12';
        if (resistance >= 14) return '#27ae60';
        if (resistance >= 7) return '#3498db';
        return '#5dade2';
    }

    createResistanceGradient(height) {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(231, 76, 60, 0.3)');
        gradient.addColorStop(0.3, 'rgba(243, 156, 18, 0.3)');
        gradient.addColorStop(0.6, 'rgba(39, 174, 96, 0.3)');
        gradient.addColorStop(1, 'rgba(52, 152, 219, 0.3)');
        return gradient;
    }

    render() {
        if (!this.route || !this.ctx) return;

        const ctx = this.ctx;
        const canvas = this.canvas;
        const width = canvas.width;
        const height = canvas.height;
        const padding = { top: 20, right: 10, bottom: 30, left: 35 };
        const graphWidth = width - padding.left - padding.right;
        const graphHeight = height - padding.top - padding.bottom;

        ctx.clearRect(0, 0, width, height);

        const { start: startIdx, end: endIdx } = this.getVisibleRange();
        const visibleData = this.route.data.slice(startIdx, endIdx);
        if (visibleData.length === 0) return;

        const getResWithOffset = (res) => {
            const offset = this.flatResistance - this.originalFlatLevel;
            return Math.max(1, Math.min(32, res + offset));
        };

        // Resistencia
        const minRes = Math.max(1, this.flatResistance - 15);
        const maxRes = Math.min(32, this.flatResistance + 15);
        const resRange = maxRes - minRes;

        // Elevación
        const elevations = visibleData.map(d => d.elevation);
        const minElev = Math.min(...elevations);
        const maxElev = Math.max(...elevations);
        const elevRange = maxElev - minElev || 1;

        // Dibujar áreas de resistencia
        const barWidth = graphWidth / visibleData.length;
        for (let i = 0; i < visibleData.length; i++) {
            const adjustedRes = getResWithOffset(visibleData[i].resistance);
            const resHeight = ((adjustedRes - minRes) / resRange) * graphHeight;
            ctx.fillStyle = this.getResistanceColor(adjustedRes);
            ctx.fillRect(
                padding.left + (i * barWidth),
                padding.top + graphHeight - resHeight,
                barWidth + 1,
                resHeight
            );
        }

        // Gradiente de resistencia
        ctx.fillStyle = this.createResistanceGradient(graphHeight);
        ctx.fillRect(padding.left, padding.top, graphWidth, graphHeight);

        // Línea de elevación
        ctx.beginPath();
        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = 2;

        for (let i = 0; i < visibleData.length; i++) {
            const x = padding.left + ((i + 0.5) / visibleData.length) * graphWidth;
            const y = padding.top + graphHeight - ((visibleData[i].elevation - minElev) / elevRange) * graphHeight;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Indicador de posición actual
        if (this.viewMode === 'scrolling') {
            const indicatorX = padding.left + (this.POSITION_PERCENT * graphWidth);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(indicatorX, padding.top);
            ctx.lineTo(indicatorX, padding.top + graphHeight);
            ctx.stroke();
        }

        // Línea FLAT
        const flatY = padding.top + graphHeight - ((this.flatResistance - minRes) / resRange) * graphHeight;
        ctx.strokeStyle = '#ffa502';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding.left, flatY);
        ctx.lineTo(padding.left + graphWidth, flatY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffa502';
        ctx.font = '10px sans-serif';
        ctx.fillText('FLAT: ' + this.flatResistance, padding.left + 2, flatY - 3);

        // Ejes
        ctx.fillStyle = '#888888';
        ctx.font = '10px sans-serif';

        const maxLabel = Math.min(32, this.flatResistance + 15);
        const minLabel = Math.max(1, this.flatResistance - 15);
        ctx.fillText(maxLabel, 2, padding.top + 10);
        ctx.fillText(minLabel, 2, padding.top + graphHeight);

        if (this.route) {
            ctx.fillText(maxElev.toFixed(0) + 'm', width - 30, padding.top + 10);
            ctx.fillText(minElev.toFixed(0) + 'm', width - 30, padding.top + graphHeight);
        }
    }
}

// ============================================
// APP PRINCIPAL
// ============================================
class App {
    constructor() {
        this.bleTrainer = new BleTrainer();
        this.simulator = new RouteSimulator();
        this.graph = new GraphRenderer('elevationGraph');
        this.autoAdjust = true;
        this.selectedType = 'intervals';

        this.init();
    }

    init() {
        this.bleTrainer.onSpeedUpdate = (data) => {
            this.simulator.updateSpeed(data.speed);
            this.updateLiveStats(data);
        };

        this.simulator.onUpdate = (state) => this.handleSimulatorUpdate(state);
        this.simulator.onComplete = () => this.handleSimulationComplete();

        // Conexión BLE
        document.getElementById('connectBtn').addEventListener('click', async () => {
            if (this.bleTrainer.isConnected) {
                await this.bleTrainer.disconnect();
                this.updateConnectionStatus(false);
            } else {
                const success = await this.bleTrainer.connect();
                this.updateConnectionStatus(success);
            }
        });

        // Crear ruta
        document.getElementById('loadRouteBtn').addEventListener('click', () => {
            const distance = parseFloat(document.getElementById('routeInput').value);
            if (isNaN(distance) || distance < 1) {
                alert('Introduce una distancia en km');
                return;
            }
            const flatLevel = parseInt(document.getElementById('resistanceSlider').value) || 10;
            this.simulator.setFlatResistance(flatLevel);
            const route = RouteGenerator.generateRoute(distance, this.selectedType || 'intervals', flatLevel);
            this.loadRoute(route);
        });

        // Reproducción
        document.getElementById('playBtn').addEventListener('click', () => {
            if (this.simulator.isPlaying) {
                this.simulator.pause();
                document.getElementById('playBtn').textContent = '▶ Reanudar';
                document.getElementById('playBtn').classList.remove('playing');
                document.getElementById('playBtn').classList.add('paused');
            } else {
                this.simulator.start();
                document.getElementById('playBtn').textContent = '⏸ Pausar';
                document.getElementById('playBtn').classList.remove('paused');
                document.getElementById('playBtn').classList.add('playing');
            }
        });

        document.getElementById('stopBtn').addEventListener('click', () => {
            this.simulator.stop();
            document.getElementById('playBtn').textContent = '▶ Iniciar Simulación';
            document.getElementById('playBtn').classList.remove('playing');
            document.getElementById('playBtn').classList.add('paused');
        });

        // Control manual de resistencia
        document.getElementById('resistanceUp').addEventListener('click', async () => {
            const current = parseInt(document.getElementById('resistanceSlider').value);
            if (current < 32) await this.bleTrainer.setResistanceLevel(current + 1);
        });

        document.getElementById('resistanceDown').addEventListener('click', async () => {
            const current = parseInt(document.getElementById('resistanceSlider').value);
            if (current > 1) await this.bleTrainer.setResistanceLevel(current - 1);
        });

        document.getElementById('resistanceSlider').addEventListener('input', async (e) => {
            const level = parseInt(e.target.value);
            document.getElementById('resistanceValue').textContent = level;
            if (this.bleTrainer.isConnected) {
                await this.bleTrainer.setResistanceLevel(level);
            }
        });

        // Cargar ruta rápida
        ['btnFlat', 'btnIntervals', 'btnMountain', 'btnAlps'].forEach(id => {
            document.getElementById(id).addEventListener('click', () => {
                const distances = { flat: 10, intervals: 15, mountain: 20, alps: 25 };
                const type = document.getElementById(id).dataset.type;
                const flatLevel = this.simulator.flatResistance;
                const route = RouteGenerator.generateRoute(distances[type], type, flatLevel);
                this.loadRoute(route);
            });
        });

        // Vista del gráfico
        document.getElementById('viewToggleBtn').addEventListener('click', () => {
            const viewMode = this.graph.toggleViewMode();
            const btn = document.getElementById('viewToggleBtn');
            btn.textContent = viewMode === 'scrolling' ? 'Vista: Detalle (2km)' : 'Vista: Completa';
        });

        // Slider nivel plano
        document.getElementById('flatLevelSlider').addEventListener('input', (e) => {
            const level = parseInt(e.target.value);
            document.getElementById('flatLevelValue').textContent = level;
            document.getElementById('resistanceSlider').value = level;
            document.getElementById('resistanceValue').textContent = level;
            if (this.simulator) {
                this.simulator.setFlatResistance(level);
                if (this.simulator.route && this.simulator.onUpdate) {
                    this.simulator.onUpdate(this.simulator.getCurrentState());
                }
            }
            if (this.graph) {
                this.graph.setFlatResistance(level);
            }
        });

        // Selección de tipo de ruta
        ['btnFlat', 'btnIntervals', 'btnMountain', 'btnAlps'].forEach(id => {
            document.getElementById(id).addEventListener('click', () => {
                ['btnFlat', 'btnIntervals', 'btnMountain', 'btnAlps'].forEach(btnId => {
                    document.getElementById(btnId).classList.remove('selected');
                });
                document.getElementById(id).classList.add('selected');
                this.selectedType = document.getElementById(id).dataset.type;
            });
        });

        document.getElementById('btnIntervals').classList.add('selected');
    }

    loadRoute(route) {
        this.simulator.loadRoute(route);
        this.graph.loadRoute(route);
        const flatLevel = this.simulator.flatResistance;
        document.getElementById('resistanceSlider').value = flatLevel;
        document.getElementById('resistanceValue').textContent = flatLevel;
        document.getElementById('targetResistance').textContent = flatLevel;
        document.getElementById('playBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('currentDistance').textContent = '0.0';
        document.getElementById('remainingKm').textContent = route.distance.toFixed(1);
    }

    handleSimulatorUpdate(state) {
        this.graph.setCurrentIndex(state.index);

        const remaining = Math.max(0, state.totalDistance - state.distance);
        document.getElementById('currentDistance').textContent = state.distance.toFixed(1);
        document.getElementById('remainingKm').textContent = remaining.toFixed(1);
        document.getElementById('targetResistance').textContent = state.targetResistance;

        const slopeEl = document.getElementById('slopeValue');
        const slope = state.slope.toFixed(1);
        slopeEl.textContent = (slope >= 0 ? '+' : '') + slope + '%';
        slopeEl.className = 'slope-value ' + (slope > 1 ? 'up' : slope < -1 ? 'down' : 'flat');

        if (this.autoAdjust && this.bleTrainer.isConnected) {
            this.bleTrainer.setResistanceLevel(state.targetResistance);
            document.getElementById('resistanceSlider').value = state.targetResistance;
            document.getElementById('resistanceValue').textContent = state.targetResistance;
        }
    }

    handleSimulationComplete() {
        document.getElementById('playBtn').textContent = '▶ Iniciar Simulación';
        document.getElementById('playBtn').classList.remove('playing');
        document.getElementById('playBtn').classList.add('paused');
        alert('¡Simulación completada!');
    }

    updateConnectionStatus(connected) {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const btn = document.getElementById('connectBtn');

        if (connected) {
            dot.classList.add('connected');
            text.textContent = 'Conectado';
            btn.textContent = '🔌 Desconectar';
            btn.classList.remove('connect');
            btn.classList.add('disconnect');
        } else {
            dot.classList.remove('connected');
            text.textContent = 'Desconectado';
            btn.textContent = '🔗 Conectar Bicicleta';
            btn.classList.remove('disconnect');
            btn.classList.add('connect');
        }
    }

    updateLiveStats(data) {
        document.getElementById('speedValue').textContent = (data.speed || 0).toFixed(1);
        document.getElementById('powerValue').textContent = data.power || 0;
    }
}

// Inicializar
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
});
