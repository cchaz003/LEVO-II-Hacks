/*
 * This is a demo program for parsing LEVO II Infusion 
 * machine status updates and posts the current status to mqtt.
 * 
 * 
 * 
 * **************************************
 * NOTE PLEASE READ:
 *      This program assumes that you connect your LEVO STM32 TX to GPIO 13 on the ESP Module.
 *      This is NOT the normal serial rx pin as this demo assumes the use of an ESP module
 *      connected to a serial chip which may interfere with the communication with the LEVO. Instead
 *      this program swaps the RX/TX pins to their alternates of GPIO 13 for RX and GPIO 15 for TX.
 *      We then setup a software serial line on the normal RX/TX pins to send data back to
 *      the pc for debugging. 
 * **************************************
 * 
 * 
 * PINS:
 *        GPIO 13 (alt uart0 rx pin) ---> STM32 TX
 *        GND ---> LEVO GND pin
 *        
 *        
 */
#include <ArduinoJson.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include "SoftwareSerial.h"
SoftwareSerial swSer1;



// Update these with values suitable for your network.
const char* ssid = "YOUR SSID";
const char* password = "YOUR NETWORK PASSWORD";
const char* mqtt_server = "YOUR MQTT BROKER";



//setup MQTT vars
WiFiClient espClient;
PubSubClient client(espClient);
unsigned long lastMsg = 0;
#define MSG_BUFFER_SIZE  (64)
char msg[MSG_BUFFER_SIZE];



String currentLine = "";  //current line being read from LEVO machine

int timeLeft = 0;         //time left in current mode

int mode = -1;            //current mode LEVO numeric ID
char modeStr[32];         //readable current mode 

int type = 0;             //current cycle type numeric ID
char typeStr[32];         //readable current cycle type

int tempF = 0;            //target cycle temperature





void setup() {
  
  Serial.begin(115200);
  Serial.swap();  //swap the serial pins of the d1 mini from the USB rx/tx pins to GPIO 15(tx) and GPIO 13(rx)
  swSer1.begin(115200, SWSERIAL_8N1, 3, 1, false, 256);
  
  delay(2000); // 2 second delay for recovery
  swSer1.println("Starting up...");

  setup_wifi();
  client.setServer(mqtt_server, 1883);
  //client.setCallback(callback);


  swSer1.println("Starting main loop");
}




void loop(){  

  //read the incoming LEVO serial data
  while(Serial.available()){
    char incoming= Serial.read();

    // as long as the incoming data is not the end of a line, add the data to the line buffer
    if(incoming != '\r' and incoming != '\n'){
      currentLine += incoming;
    }

    // if the incoming data was the end of a line (above if statement failed), 
    // then check that the line contains data and parse the line (updates MQTT if needed)
    else if(currentLine.equals(String("")) == false){

      swSer1.printf("Line Read: %s\n", currentLine.c_str());

      //parse and update MQTT
      if(parseCurrentLine()){
        updateMQTT();
      }

      //reset the line
      currentLine = String("");
    }
  }

  //handle wifi & mqtt tasks
  if (!client.connected()) {reconnect();}
  client.loop();
  
  delay(5);
}


//publish the current mode/time left in cycle/target temp to mqtt
void updateMQTT(){
  client.publish("home/LEVO/state", modeStr);
  client.publish("home/LEVO/temp", String(tempF).c_str());
  client.publish("home/LEVO/time", String(timeLeft).c_str());
}



bool parseCurrentLine(){
  currentLine.trim();

  //note the mode at the start of the function (used to determine whether to return T/F)
  int initMode = mode;

  //if the line did not start as a JSON update, then it must be one of the basic string type updates
  if(currentLine.startsWith("UPDATE_STATE|") == false){

    //set mode to idle/reset if we get a cycle reset or bootup message
    if(currentLine.equals("RESET_CYCLE") || currentLine.equals("IMALIVE")){mode = 0;}

    //set the mode to one of the active cycles (drying/infusing/activating) depending on the stored cycle type
    else if(currentLine.equals("WARMUP_COMPLETE")){
      if(type == 0){mode = 7;}
      else if(type == 1){mode = 10;}
      else if(type == 2){mode = 4;}
    }

    //similar to the set above, set the mode to one of the cycle complete values
    else if(currentLine.equals("CYCLE_COMPLETE")){
      if(type == 0){mode = 8;}
      else if(type == 1){mode = 11;}
      else if(type == 2){mode = 5;}
    }

    //if we get some other data, set the mode string to unknown (alt because a mode of 1 is currently also unknown)
    else{snprintf(modeStr, sizeof(modeStr), "UNKNOWN_ALT");}
  }

  //else the update must be a json type update
  else{

    //remove the non json portion and deserialize into a json doc
    currentLine.replace("UPDATE_STATE|", "");
    DynamicJsonDocument doc(256);
    deserializeJson(doc, (const char*)currentLine.c_str(), currentLine.length());

    //as long we find the correct keys for each of the time/temp/mode/cycle type are available, store them as ints
    if(!doc["newtemp"].isNull()){
      tempF = doc["newtemp"].as<int>();
    }
    if(!doc["newtime"].isNull()){
      timeLeft = doc["newtime"].as<int>();
    }
    if(!doc["dstat"].isNull()){
      mode = doc["dstat"].as<int>();
    }
    if(!doc["newtype"].isNull()){
      type = doc["newtype"].as<int>();
    }

    //set the cycle type string
    if(type == 0){snprintf(typeStr, sizeof(typeStr), "DRYING");}
    else if(type == 1){snprintf(typeStr, sizeof(typeStr), "ACTIVATING");}
    else if(type == 2){snprintf(typeStr, sizeof(typeStr), "INFUSING");}

  }

  
  //set the mode string
  if(mode == 0){snprintf(modeStr, sizeof(modeStr), "IDLE/RESET");}
  else if(mode == 1){snprintf(modeStr, sizeof(modeStr), "UNKNOWN");}
  else if(mode == 2){snprintf(modeStr, sizeof(modeStr), "WARMING - %s", typeStr);}

  else if(mode == 3){snprintf(modeStr, sizeof(modeStr), "PAUSED (INFUSING)");}
  else if(mode == 4){snprintf(modeStr, sizeof(modeStr), "INFUSING");}
  else if(mode == 5){snprintf(modeStr, sizeof(modeStr), "INFUSING COMPLETE");}

  else if(mode == 6){snprintf(modeStr, sizeof(modeStr), "PAUSED (DRYING)");}
  else if(mode == 7){snprintf(modeStr, sizeof(modeStr), "DRYING");}
  else if(mode == 8){snprintf(modeStr, sizeof(modeStr), "DRYING COMPLETE");}

  else if(mode == 9){snprintf(modeStr, sizeof(modeStr), "PAUSED (ACTIVATING)");}
  else if(mode == 10){snprintf(modeStr, sizeof(modeStr), "ACTIVATING");}
  else if(mode == 11){snprintf(modeStr, sizeof(modeStr), "ACTIVATING COMPLETE");}

  //debug
  swSer1.printf("Temp F: %d\n", tempF);
  swSer1.printf("Time: %d\n", timeLeft);
  swSer1.printf("Mode: %s\n", modeStr);
  swSer1.printf("Type: %s\n", typeStr);
  swSer1.println();

  //return true on mode change
  if(initMode != mode){return true;}
  else{return false;}
  
}














//////////// MQTT & WIFI CONNECTION STUFF BELOW  ////////////////

void setup_wifi() {

  delay(10);
  // We start by connecting to a WiFi network
  swSer1.println();
  swSer1.print("Connecting to ");
  swSer1.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    swSer1.print(".");
  }


  swSer1.println("");
  swSer1.println("WiFi connected");
  swSer1.println("IP address: ");
  swSer1.println(WiFi.localIP());
}

void reconnect() {
  // Loop until we're reconnected
  while (!client.connected()) {
    swSer1.print("Attempting MQTT connection...");
    // Create a random client ID
    String clientId = "ESP8266Client-";
    clientId += String(random(0xffff), HEX);
    // Attempt to connect
    if (client.connect(clientId.c_str())) {
      swSer1.println("connected");
      // Once connected, publish an announcement...
      client.publish("outTopic", "hello world");
      // ... and resubscribe
      client.subscribe("inTopic");
    } else {
      swSer1.print("failed, rc=");
      swSer1.print(client.state());
      swSer1.println(" try again in 5 seconds");
      // Wait 5 seconds before retrying
      delay(5000);
    }
  }
}
