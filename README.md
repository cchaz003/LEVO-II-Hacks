
# LEVO-II-Hacks
A Repository of information for LEVO II Oil Infusion machines and how to get the data that LEVO took away from it's customers. The LEVO II was marketed as a "smart" device that could be monitored and controlled from an app. Unfortunately the developers removed the monitoring/control features from the app and converted the app into a pseudo storefront for their products. This left many users upset as that was a big selling point vs other infusion machines. This was certainly a feature I liked when I first recieved my unit. 

**What this repository is:** 

This repository is a place to store information & examples about the machine & the communication protocols between the main CPU (STM32) and the wifi chipset (ESP WROOM-02 / ESP8266 variant). By understanding the communication between these two chips, we can parse data from the main CPU with a separate microcontroller to monitor the status of the device & generate our own commands to control it. I have created this repo in case it may be useful to any other hardware hackers out there with the tools, abilities, and knowledge to crack open their own machine and poke around. This repo also exists as a means to warn anyone who cares to know that there are some unfortunate **security vulnerabilites exposed from this machine such as network SSID and passwords.**



**What this repository is not:** 

This is not a repository for information of the modification of the original firmwares or any attempts to hack/modify/gain access to any LEVO web services. This is purely to re-gain the access to LOCAL features that the original developers removed by understanding the communications between the main CPU and wifi chipset.



**Warning:** 

In order to do most of what is outlined in this repository you will need to open your machine and solder wires to the main circuitboard that contains the CPU and WiFi chipset and be familiar with using Arduino-type microcontrollers. *This will absolutely void any warranty that you may have and could be dangerous if you are unfamiliar with opening up mains voltage electronics*. Please be smart and don't attempt anything you are not comfortable with. You could easily brick your machine or hurt yourself if you are not careful. I take no responsibility for damaged hardware or harm that may be caused by opening or modifying your LEVO machine. ***If you have not done something like this before or do not feel comfortable working near mains electronics please do not attempt to open your LEVO Infusion machine.*** You have been warned. 

**Now on to the fun stuff!**

## About the Hardware:
The LEVO II is controlled by a pair of microcontrollers. The main CPU is (as far as I can tell) an STM32 type chip. I haven't poked at it too much but the label on the top looks like an STM32 to me. The other more interesting find is that the WiFi Chipset is an ESP82XX type module (ESP WROOM-02 by the looks of it). This is a well known and widely used module in the DIY community so when I saw it I knew this machine would be hackable. An image of the main PCB is pictured below (image from FCC docs).

![LEVO II main PCB](https://github.com/cchaz003/LEVO-II-Hacks/blob/main/images/mainPCB.png)

You can see more images of some of the internal components found here: https://fccid.io/2AQQX857722/Internal-Photos/Internal-photos-4055926

*As an aside: fccid.io is a great place to learn about electronics before you open them up! All electronics that get FCC certification must be tested and documented and fccid stores most (all?) electronics with an FCC number. A great place to start learning about a piece of hardware is to google something like "Levo II fccid" or even lookup the fcc code on the label of the product.*

# Communications between the main CPU and WiFi Chipset


The communications between the STM32 and ESP82XX chipset are done via 3.3V UART at 115200 baud using the native ESP serial pins (GPIO 3=rx and GPIO 1=tx). I haven't checked which pins the Tx/Rx are using on the STM32 but as long as we know which lines to tap on the ESP module that shouldn't really matter. Along the right side of the ESP module (wifi antenna up) are a pair of soldered jumper bridges, these bridges are the TX/RX connection that we can tap into to monitor the serial flow (see image below). 

![LEVO II ESP82XX pins](https://github.com/cchaz003/LEVO-II-Hacks/blob/main/images/ESP82XX.png)

## Communication from the STM32 -> ESP82XX:

Comms from the main CPU are fairly easy to parse (which allows us to monitor the status of the device). All communications end with both a newline ("/n") and return ("/r") and the commands take the form of either a basic string (ex `RESET_CYCLE`) or as an update with json data 
(ex `UPDATE_STATE|{"newtemp":180,"newtime":3,"newtype":2,"dstat":2}`)

***Known basic update strings:***

`RESET_CYCLE` sent when selecting a new cycle

`IMALIVE` sent at boot-up (sometimes takes 10-20 seconds?)

`CYCLE_COMPLETE` sent when any given cycle is completed

`WARMUP_COMPLETE` send when warmup is completed and the target cycle starts


***UPDATE_STATE information:***
This type of update is sent whenever the device changes state to something other than one of the strings noted above. An example update may look like this:
`UPDATE_STATE|{"newtemp":180,"newtime":3,"newtype":2,"dstat":2}`
The pipe ( | ) separates the text from the json data and can be used to parse the `UPDATE_STATE` portion from the json data portion 

`{"newtemp":180,"newtime":3,"newtype":2,"dstat":2}`  

The example above update reflects the following status:
-	target temperature is `180°F`
-	time left in the cycle is `3 minutes`
-	the cycle type is `Infusing`
-	the current state is `Warming`

**`newtemp`** target temperature in °F (Even if I change to °C on my machine it sends updates in °F)

**`newtime`** time in minutes until cycle is finished (this will always be an integer value)

**`newtype`** type of the current cycle
| newtype | meaning |
|--|--|
| 0 | Drying |
| 1 | Activating |
| 2 | Infusing |

**`dstat`** current mode/state of the machine
| dstat | meaning |
|--|--|
| 0 | Idle/Reset |
| 1 | Unknown |
| 2 | Warming |
| 3 | Infusing Paused |
| 4 | Infusing |
| 5 | Infusing Complete |
| 6 | Dying Paused |
| 7 | Drying |
| 8 | Drying Complete |
| 9 | Activating Paused |
| 10 | Activating |
| 11 | Activating Complete |

## Communication from the ESP82XX -> STM32:
Comms from the ESP module to the STM cpu are not as well known documented at this point but there are a couple of known signals that it sends. At bootup the ESP module prints out some boot debug info before switching to UART1 (GPIO 2 TX I believe). The ESP runs Mongoose OS. More information about the Mongoose installation can be found in the next section. 

When the STM32 starts up/when the user "turns on" the machine, the ESP is automatically reset. It then begins searching for and connecting to WiFi if available. Similar to the STM32->ESP82XX data, the ESP82XX sends either basic strings for simple updates or a string plus json data for more complex updates. 

***Known basic update strings:***
`WIFI_CONNECTING` sent when searching for WiFi
`WIFI_CONNECTED` sent when connected to WiFi


***STATE_UPDATED information:***
`STATE_UPDATED` appears to be sent whenever the ESP modules wants to control the STM32. I believe this used to be how the app would control the device but I have not yet started sending my own states to test this out. What I do know is that whenever the STM32 sends a basic signal like `WARMUP_COMPLETE`, the ESP responds with a `STATE_UPDATED` signal like this:
`STATE_UPDATED {"status":7,"units":0,"status_text":"","display_name":""} `

**`status`** this appears to match the same values as `dstat` from the table in the section above

**`units`** this is always 0 on my machine but I think it refers to the temperature units that the ESP would like updates sent in (my guess is `0=°F` and `1=°C`)

**`status_text`** unknown

**`display_name`** unknown - maybe it can display a specific name for this profile/cycle like "Infusing Butter"?


# ESP82XX Web Server:

For some reason the developers decided to leave an open web-server running on the ESP82XX that exposes too much information IMO. Within these files are various config data that includes exposed certificates as well as config information for AWS (LEVO apparently uses [used?] AWS IoT services for their devices). Thankfully the "AWS Thing" key appears to be hidden but this is still too much information. There is also the **WiFi network SSID & password in clear text(!)** just hosted on this web server out in the open for anyone to read. If you are curious, please take a look at the WEBSERVER_FILES folder in this repository for a full set of the files. 

## Files of note:

**`init.js`** 
One great thing the developers left for us to peruse is the main `init.js` file for communication between the ESP and STM32. This was very helpful in determining what some of what those signals meant and will continue to be useful as we discover more about monitoring & controlling the main STM32. Please have a look at this file if you are interested in helping out with understanding more about the ESP<->STM32 comms!

**`conf0.json`** 
This file appears to contain basic/default config information related to the ESP hardware and initial configuration of the device. 

**`conf9.json`**  
This file appears to contain configuration data for the device once it has been setup. In this file you can find information like the AWS IoT Thing Name/ID, the AWS MQTT server address, filenames for the ssl cert (also available from the web server), the Mongoose OS Dash token (for provisioning and OTA firmware updates), **and the flipping WiFi network SSID & password in clear text!**. Not cool guys. 








