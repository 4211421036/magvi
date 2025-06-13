#ifndef MAGNET_SENSOR_H
#define MAGNET_SENSOR_H

#include <Arduino.h>

class MagnetSensor {
  private:
    uint8_t pin;
    float vQuiescent;  // 2.5V @ B=0
    float sensitivity; // 1.8 mV/G
    int samples;
    
    float readVoltage();
    
  public:
    MagnetSensor(uint8_t analogPin, float vq = 2.5, float sens = 1.8, int numSamples = 10);
    
    void calibrateZeroField(); // Kalibrasi otomatis saat B=0
    float getFieldGauss();
    float getFieldTesla();
};

#endif
