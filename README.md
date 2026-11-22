# AgroSmart – Simulador de riego inteligente y alerta ambiental

Aplicación web local con Python + Flask para simular el paso del tiempo, automatizar una regla de riego por horario y humedad del suelo, y mostrar una alerta ambiental de demostración basada en hora, temperatura y humedad del aire.

## Requisitos
- Python 3.10 o superior.
- Visual Studio Code.
- Navegador actualizado (Chrome, Edge o Firefox).

## Instalación en Windows

Abre esta carpeta en Visual Studio Code. En **Terminal > New Terminal**, ejecuta:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Si PowerShell bloquea la activación del entorno, puedes instalar y ejecutar sin activarlo:

```powershell
py -m pip install -r requirements.txt
py app.py
```

Abre en el navegador: <http://127.0.0.1:5000>

Para detener el servidor, vuelve a la terminal y presiona `Ctrl + C`.

## Cómo probar
1. Pulsa **+ 1 hora** o **Iniciar** para mover el reloj.
2. Usa **Día caluroso y seco** para probar el riego cuando el suelo está seco.
3. Usa **Lluvia repentina** y avanza una hora para ver cómo aumenta la humedad y se bloquea el riego si ya se alcanzó el objetivo.
4. Usa **Atardecer** para ver la alerta cuando coinciden la franja horaria, la temperatura y la humedad ambiental.
5. Modifica los valores del panel **Configuración** y guarda los cambios.
6. Pulsa **Habilitar sonido** para permitir el pitido de demostración del navegador.

## Reglas simplificadas del simulador
- El riego solo puede operar dentro del horario configurado.
- Si la humedad del suelo está en el objetivo o por encima, el riego se bloquea y se contabiliza un ahorro estimado de 120 L por hora programada omitida.
- Si la humedad está por debajo del objetivo, el riego eleva el indicador hasta un máximo de 12 puntos porcentuales por hora simulada. El consumo se estima con 10 L por cada punto porcentual aplicado.
- La alerta de mosquitos se activa solo cuando coinciden la franja horaria, el rango de temperatura y la humedad ambiental mínima.
- El modelo ambiental es didáctico y ajustable. No es una predicción científica ni demuestra que un sonido pueda repeler mosquitos reales.
- Los datos se guardan en memoria mientras el servidor está encendido. Al reiniciar la aplicación, la simulación vuelve al estado inicial.

## Estructura

```text
Simulador_Riego_Inteligente/
├── app.py
├── simulation.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── styles.css
    └── js/
        └── app.js
```
