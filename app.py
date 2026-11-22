from flask import Flask, jsonify, render_template, request

from simulation import Simulator

app = Flask(__name__)
simulator = Simulator()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def get_state():
    return jsonify(simulator.get_state())


@app.post("/api/tick")
def tick():
    data = request.get_json(silent=True) or {}
    try:
        hours = int(data.get("hours", 1))
        simulator.advance(hours)
        return jsonify(simulator.get_state())
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400


@app.post("/api/settings")
def update_settings():
    data = request.get_json(silent=True) or {}
    try:
        simulator.update_settings(data)
        return jsonify(simulator.get_state())
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@app.post("/api/scenario")
def change_scenario():
    data = request.get_json(silent=True) or {}
    try:
        simulator.set_scenario(str(data.get("scenario", "normal")))
        return jsonify(simulator.get_state())
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@app.post("/api/reset")
def reset():
    simulator.reset()
    return jsonify(simulator.get_state())


if __name__ == "__main__":
    # Solo para ejecutar el proyecto localmente durante el desarrollo.
    app.run(debug=True, host="127.0.0.1", port=5000)
