"""Logica de simulacion para riego inteligente y alerta ambiental.

Los valores ambientales y las reglas son didacticos: sirven para experimentar
con el software y no representan un pronostico meteorologico ni un modelo
cientifico de poblaciones de mosquitos.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from math import cos, pi
from typing import Any


class Simulator:
    LITERS_PER_MOISTURE_POINT = 10.0
    REFERENCE_LITERS_PER_HOUR = 120.0
    IRRIGATION_GAIN_PER_HOUR = 12.0
    BEACON_WATTS = 3.0

    DEFAULT_SETTINGS = {
        "target_moisture": 60,
        "irrigation_start": 5,
        "irrigation_end": 8,
        "temp_min": 22,
        "temp_max": 30,
        "humidity_min": 60,
        "morning_start": 5,
        "morning_end": 9,
        "evening_start": 17,
        "evening_end": 22,
    }

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.simulated_time = datetime(2026, 1, 1, 5, 0)
        self.soil_moisture = 38.0
        self.temperature = 22.0
        self.air_humidity = 70.0
        self.rain_pending = False
        self.scenario = "normal"
        self.settings = dict(self.DEFAULT_SETTINGS)
        self.water_used_l = 0.0
        self.water_saved_l = 0.0
        self.beacon_energy_wh = 0.0
        self.irrigation_status = "waiting"
        self.irrigation_message = "En espera del siguiente ciclo"
        self.mosquito_active = False
        self.mosquito_score = 0
        self.mosquito_conditions = {
            "time": False,
            "temperature": False,
            "humidity": False,
        }
        self.logs: list[dict[str, str]] = []
        self.history: list[dict[str, Any]] = []
        self._update_normal_climate()
        self._add_log("Sistema iniciado. Simulacion lista para experimentar.", "system")
        self._record_history()

    @staticmethod
    def _clamp(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

    @staticmethod
    def _in_time_window(hour: int, start: int, end: int) -> bool:
        """Ventana horaria [inicio, fin); admite ventanas que cruzan medianoche."""
        if start == end:
            return False
        if start < end:
            return start <= hour < end
        return hour >= start or hour < end

    def _add_log(self, message: str, kind: str = "info") -> None:
        self.logs.insert(
            0,
            {
                "time": self.simulated_time.strftime("Dia %d - %H:%M"),
                "message": message,
                "kind": kind,
            },
        )
        self.logs = self.logs[:40]

    def update_settings(self, incoming: dict[str, Any]) -> None:
        numeric_ranges = {
            "target_moisture": (35, 85),
            "irrigation_start": (0, 23),
            "irrigation_end": (0, 23),
            "temp_min": (10, 40),
            "temp_max": (10, 45),
            "humidity_min": (20, 100),
            "morning_start": (0, 23),
            "morning_end": (0, 23),
            "evening_start": (0, 23),
            "evening_end": (0, 23),
        }
        updated = dict(self.settings)
        for key, (minimum, maximum) in numeric_ranges.items():
            if key not in incoming:
                continue
            try:
                value = int(float(incoming[key]))
            except (TypeError, ValueError):
                raise ValueError(f"El valor de {key} no es numerico.") from None
            if not minimum <= value <= maximum:
                raise ValueError(f"El valor de {key} debe estar entre {minimum} y {maximum}.")
            updated[key] = value

        if updated["temp_min"] >= updated["temp_max"]:
            raise ValueError("La temperatura minima debe ser menor que la maxima.")
        self.settings = updated
        self._add_log("Configuracion actualizada por el usuario.", "system")
        self._evaluate_mosquito_alert()

    def set_scenario(self, scenario: str) -> None:
        if scenario == "hot_dry":
            self.scenario = scenario
            self.simulated_time = self.simulated_time.replace(hour=5, minute=0)
            self.soil_moisture = 24.0
            self.temperature = 32.0
            self.air_humidity = 35.0
            self.rain_pending = False
            self._add_log("Escenario cargado: dia caluroso y seco. El suelo comienza con poca humedad.", "scenario")
        elif scenario == "sudden_rain":
            self.scenario = scenario
            self.simulated_time = self.simulated_time.replace(hour=5, minute=0)
            self.soil_moisture = 48.0
            self.temperature = 22.0
            self.air_humidity = 95.0
            self.rain_pending = True
            self._add_log("Escenario cargado: lluvia repentina preparada para el siguiente avance de hora.", "scenario")
        elif scenario == "mosquito_dusk":
            self.scenario = scenario
            self.simulated_time = self.simulated_time.replace(hour=18, minute=0)
            self.soil_moisture = 48.0
            self.temperature = 27.0
            self.air_humidity = 82.0
            self.rain_pending = False
            self._add_log("Escenario cargado: atardecer con condiciones favorables configuradas para la demostracion.", "scenario")
        elif scenario == "normal":
            self.scenario = scenario
            self.rain_pending = False
            self._add_log("Escenario normal activado.", "scenario")
            self._update_normal_climate()
        else:
            raise ValueError("Escenario no reconocido.")

        self._evaluate_mosquito_alert()
        self._record_history()

    def _update_normal_climate(self) -> None:
        # Ciclo diario simplificado: la temperatura alcanza su maximo cerca de las 14:00.
        hour = self.simulated_time.hour
        self.temperature = round(24 + 6 * cos((hour - 14) * pi / 12), 1)
        self.air_humidity = round(self._clamp(72 - (self.temperature - 24) * 1.4, 35, 95), 1)

    def _evaluate_mosquito_alert(self) -> None:
        hour = self.simulated_time.hour
        time_ok = (
            self._in_time_window(hour, self.settings["morning_start"], self.settings["morning_end"])
            or self._in_time_window(hour, self.settings["evening_start"], self.settings["evening_end"])
        )
        temp_ok = self.settings["temp_min"] <= self.temperature <= self.settings["temp_max"]
        humidity_ok = self.air_humidity >= self.settings["humidity_min"]
        score = (35 if time_ok else 0) + (35 if temp_ok else 0) + (30 if humidity_ok else 0)
        active = time_ok and temp_ok and humidity_ok

        if active and not self.mosquito_active:
            self._add_log(
                f"{self.temperature:.1f} C y {self.air_humidity:.0f}% de humedad ambiental: alerta simulada de mosquitos ACTIVADA.",
                "alert",
            )
            self.beacon_energy_wh += self.BEACON_WATTS
        elif active and self.mosquito_active:
            self.beacon_energy_wh += self.BEACON_WATTS
        elif not active and self.mosquito_active:
            self._add_log("Condiciones fuera del rango configurado: alerta simulada en espera.", "system")

        self.mosquito_active = active
        self.mosquito_score = score
        self.mosquito_conditions = {
            "time": time_ok,
            "temperature": temp_ok,
            "humidity": humidity_ok,
        }

    def _process_irrigation(self) -> None:
        hour = self.simulated_time.hour
        in_window = self._in_time_window(
            hour,
            self.settings["irrigation_start"],
            self.settings["irrigation_end"],
        )
        target = float(self.settings["target_moisture"])

        if not in_window:
            self.irrigation_status = "outside"
            self.irrigation_message = "Fuera del horario programado"
            return

        if self.soil_moisture >= target:
            self.irrigation_status = "blocked"
            self.irrigation_message = "Bloqueado: el suelo ya tiene suficiente humedad"
            self.water_saved_l += self.REFERENCE_LITERS_PER_HOUR
            self._add_log(
                f"Humedad del suelo {self.soil_moisture:.1f}%: riego omitido. Ahorro estimado: {self.REFERENCE_LITERS_PER_HOUR:.0f} L.",
                "saving",
            )
            return

        increase = min(self.IRRIGATION_GAIN_PER_HOUR, target - self.soil_moisture)
        liters = increase * self.LITERS_PER_MOISTURE_POINT
        self.soil_moisture = self._clamp(self.soil_moisture + increase, 0, 100)
        self.water_used_l += liters
        self.irrigation_status = "active"
        self.irrigation_message = f"Riego activo: se aplicaron {liters:.0f} L en esta hora simulada"
        self._add_log(
            f"Riego activado. Humedad del suelo: {self.soil_moisture:.1f}%. Agua utilizada: {liters:.0f} L.",
            "water",
        )

    def advance(self, hours: int = 1) -> None:
        if not 1 <= hours <= 24:
            raise ValueError("El avance debe estar entre 1 y 24 horas simuladas.")

        for _ in range(hours):
            self.simulated_time += timedelta(hours=1)

            if self.scenario == "hot_dry":
                self.temperature = 32.0
                self.air_humidity = 35.0
            elif self.scenario == "mosquito_dusk":
                self.temperature = 27.0
                self.air_humidity = 82.0
            else:
                self._update_normal_climate()

            # La lluvia del escenario ocurre una sola vez, en el siguiente avance.
            if self.rain_pending:
                self.soil_moisture = self._clamp(self.soil_moisture + 28, 0, 100)
                self.rain_pending = False
                self._add_log(
                    f"Lluvia simulada: la humedad del suelo subio a {self.soil_moisture:.1f}%.",
                    "rain",
                )

            evaporation = 0.5 + max(0.0, self.temperature - 25) * 0.08
            self.soil_moisture = self._clamp(self.soil_moisture - evaporation, 0, 100)
            self._process_irrigation()
            self._evaluate_mosquito_alert()
            self._record_history()

    def _record_history(self) -> None:
        self.history.append(
            {
                "label": self.simulated_time.strftime("D%d %H:%M"),
                "moisture": round(self.soil_moisture, 1),
                "target": self.settings["target_moisture"],
                "used": round(self.water_used_l, 1),
                "saved": round(self.water_saved_l, 1),
            }
        )
        self.history = self.history[-30:]

    def get_state(self) -> dict[str, Any]:
        return {
            "clock": self.simulated_time.strftime("%H:%M"),
            "day": self.simulated_time.strftime("Dia %d"),
            "temperature": round(self.temperature, 1),
            "air_humidity": round(self.air_humidity, 1),
            "soil_moisture": round(self.soil_moisture, 1),
            "scenario": self.scenario,
            "settings": dict(self.settings),
            "irrigation": {
                "status": self.irrigation_status,
                "message": self.irrigation_message,
            },
            "mosquito": {
                "active": self.mosquito_active,
                "score": self.mosquito_score,
                "conditions": dict(self.mosquito_conditions),
            },
            "metrics": {
                "water_used_l": round(self.water_used_l, 1),
                "water_saved_l": round(self.water_saved_l, 1),
                "beacon_energy_wh": round(self.beacon_energy_wh, 1),
            },
            "history": list(self.history),
            "logs": list(self.logs),
        }
