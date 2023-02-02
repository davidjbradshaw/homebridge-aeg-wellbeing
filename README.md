# Homebridge integration for AEG Wellbeing

This is the AEG Wellbeing plugin for [Homebridge](https://github.com/nfarina/homebridge). This plugin will add support for AEG Air Purifiers with all their sensors (Air Quality, Temperature, Humidity, CO2 and Light) 
to your Home app. 

## Installation
`npm install -g homebridge-aeg-wellbeing` or use Homebridge UI

## Configuration
Use Homebridge UI to configure and set your username and password.

### Ionizer
Currently, there is no support for ionizer in HomeKit, so we mapped this to Swing Mode instead. 
Use oscilliator/swing mode to control ionizer on/off.

*This is plugin is forked from [homebridge-electrolux-wellbeing](https://github.com/baboons/homebridge-electrolux-wellbeing). It fixes a few bugs and gets rid of the light sensor. The plugin has been tested with an AEG AX9 Air Purifier, and should work with any AEG or Electolux purifier that uses their common API.*
