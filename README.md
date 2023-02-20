# Homebridge integration for AEG Wellbeing

This is the AEG Wellbeing plugin for [Homebridge](https://github.com/nfarina/homebridge). 

## Supported devices
This plugin will add support for AEG Wellbeing Air Purifiers and all their sensors (Air Quality, Temperature, Humidity, CO2, Filter Life) to your Home app. It has been tested on the following models:

 - AEG Wellbeing AX9
 - AEG Wellbeing AX5

_If you have another model in the range and it works for you, then please add it to this list._

## Configuration
Use Homebridge UI to configure and set your username and password. This is the same as used in the AEG Wellbeing App.

### Ionizer
Currently, there is no support for ionizer in HomeKit, so we mapped this to Swing Mode instead. 
Use oscilliator/swing mode to control ionizer on/off.

---

*This is plugin is forked from [homebridge-electrolux-wellbeing](https://github.com/baboons/homebridge-electrolux-wellbeing). It fixes a few bugs and now only adds sensors supported by the connected device, which veries by model. If you have an Electrolux Wellbeing Air Purifier then this plugin should work with your device as both brands use a common API.*

