#include "MagnetSensor.h"

MagnetSensor::MagnetSensor(uint8_t analogPin, float vq, float sens, int numSamples) {
  pin = analogPin;
  vQuiescent = vq;
  sensitivity = sens / 1000; // Convert mV/G to V/G
  samples = numSamples;
  pinMode(pin, INPUT);
}

float MagnetSensor::readVoltage() {
  float sum = 0;
  for(int i=0; i<samples; i++) {
    sum += analogRead(pin);
    delayMicroseconds(100); // Sesuai response time 3μs
  }
  return (sum / samples) * (5.0 / 1023.0); // Konversi ke volt
}

void MagnetSensor::calibrateZeroField() {
  vQuiescent = readVoltage(); // Asumsi B=0 saat kalibrasi
}

float MagnetSensor::getFieldGauss() {
  float vOut = readVoltage();
  return (vOut - vQuiescent) / sensitivity;
}

float MagnetSensor::getFieldTesla() {
  return getFieldGauss() / 10000.0;
}
