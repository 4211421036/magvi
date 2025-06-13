/**
 * @file MagnetSense.ino
 * @brief Magnetometer sensor with second-by-second measurement
 * @author GALIH RIDHO UTOMO, Dinar
 * @return
 */
#include "MagnetSensor.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "x";
const char* password = "x";

// GitHub repository information
const char* githubUsername = "4211421036";
const char* githubRepo = "magvi";
const char* githubToken = "x";
const char* dataPath = "magnet_data.json";

// Pin untuk sensor magnet
const int MagViPin = 13;
MagnetSensor sensor(MagViPin); // Pin analog A0

// Interval untuk upload data (milliseconds)
const unsigned long uploadInterval = 60000; // 1 minute (reduced from 5 minutes)
unsigned long lastUploadTime = 0;

// Buffer for readings (increased to hold 60 readings for 1 minute)
const int MAX_READINGS = 60;
struct Reading {
  float magneticField;
  unsigned long timestamp;
};

Reading readings[MAX_READINGS];
int readingIndex = 0;
unsigned long lastMeasurementTime = 0;
const unsigned long measurementInterval = 1000; // 1 second

void setup() {
  Serial.begin(9600);
  Serial.println(F("Magnet Sensor with GitHub Integration (JSON)"));
  
  // Kalibrasi sensor
  sensor.calibrateZeroField(); // Pastikan tidak ada medan saat kalibrasi
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
  
  Serial.println(F("Sensor initialized"));
  Serial.println(F("Format: Magnetic Field (Tesla)"));
  
  lastMeasurementTime = millis();
}

void loop() {
  unsigned long currentTime = millis();
  
  // Mengukur medan magnet setiap detik
  if (currentTime - lastMeasurementTime >= measurementInterval) {
    lastMeasurementTime = currentTime;
    
    // Membaca medan magnet
    float magneticField = sensor.getFieldTesla();
    
    // Menampilkan hasil
    Serial.print("Medan Magnet: ");
    Serial.print(magneticField, 6);
    Serial.println(" T");
    
    // Store reading in buffer
    readings[readingIndex].magneticField = magneticField;
    readings[readingIndex].timestamp = currentTime / 1000; // Convert to seconds
    
    readingIndex = (readingIndex + 1) % MAX_READINGS;
  }
  
  // Upload data setiap 1 menit (bisa disesuaikan)
  if (currentTime - lastUploadTime >= uploadInterval) {
    uploadToGitHub();
    lastUploadTime = currentTime;
  }
  
  // Small delay to prevent watchdog timer issues
  delay(10);
}

void uploadToGitHub() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Cannot upload data.");
    return;
  }
  
  Serial.println("Preparing to upload data to GitHub...");
  
  // Get the current content of the file (if it exists)
  String currentContent = getFileContent();
  String sha = "";
  
  if (currentContent.length() > 0) {
    // Extract the SHA of the file
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, currentContent);
    sha = doc["sha"].as<String>();
  }
  
  // Prepare new content
  String newContent = prepareJsonContent();
  
  // Upload to GitHub
  updateGitHubFile(newContent, sha);
}

String getFileContent() {
  HTTPClient http;
  String url = "https://api.github.com/repos/" + String(githubUsername) + "/" + String(githubRepo) + "/contents/" + String(dataPath);
  
  http.begin(url);
  http.addHeader("User-Agent", "ESP32");
  http.addHeader("Authorization", "token " + String(githubToken));
  
  int httpCode = http.GET();
  String payload = "";
  
  if (httpCode > 0) {
    payload = http.getString();
  } else {
    Serial.println("Error on HTTP request: " + String(httpCode));
  }
  
  http.end();
  return payload;
}

String prepareJsonContent() {
  // Create JSON document (increased size to accommodate more readings)
  DynamicJsonDocument doc(8192);
  
  // Add configuration
  JsonObject config = doc.createNestedObject("config");
  config["sensorType"] = "SS49E";
  config["analogPin"] = MagViPin;
  config["measurementInterval"] = measurementInterval;
  config["uploadInterval"] = uploadInterval;
  
  // Add system info
  doc["uptime"] = millis() / 1000; // Convert to seconds
  
  // Add readings
  JsonArray readingsArray = doc.createNestedArray("readings");
  
  for (int i = 0; i < MAX_READINGS; i++) {
    if (readings[i].timestamp > 0) {  // Only include valid readings
      JsonObject reading = readingsArray.createNestedObject();
      reading["timestamp"] = readings[i].timestamp;
      reading["magneticField"] = readings[i].magneticField;
    }
  }
  
  // Serialize JSON to string
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Base64 encode the JSON
  return base64Encode(jsonString);
}

void updateGitHubFile(String content, String sha) {
  HTTPClient http;
  String url = "https://api.github.com/repos/" + String(githubUsername) + "/" + String(githubRepo) + "/contents/" + String(dataPath);
  
  http.begin(url);
  http.addHeader("User-Agent", "ESP32");
  http.addHeader("Authorization", "token " + String(githubToken));
  http.addHeader("Content-Type", "application/json");
  
  // Prepare the JSON request body
  String requestBody = "{\"message\":\"Update magnet readings\",\"content\":\"" + content + "\"";
  if (sha.length() > 0) {
    requestBody += ",\"sha\":\"" + sha + "\"";
  }
  requestBody += "}";
  
  int httpCode = http.PUT(requestBody);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.println("GitHub response: " + String(httpCode));
    Serial.println(response);
  } else {
    Serial.println("Error on HTTP request: " + String(httpCode));
  }
  
  http.end();
}

// Simple Base64 encoding function
String base64Encode(String input) {
  const char* ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  int paddingCount = (3 - (input.length() % 3)) % 3;
  String output = "";
  int val = 0, valb = -6;
  
  for (int i = 0; i < input.length(); i++) {
    unsigned char c = input.charAt(i);
    val = (val << 8) + c;
    valb += 8;
    while (valb >= 0) {
      output += ALPHABET[(val >> valb) & 0x3F];
      valb -= 6;
    }
  }
  
  if (valb > -6) {
    output += ALPHABET[((val << 8) >> (valb + 8)) & 0x3F];
  }
  
  while (paddingCount--) {
    output += "=";
  }
  
  return output;
}
