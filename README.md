# Homebridge Integration for AEG Wellbeing

The AEG Wellbeing plugin for [Homebridge](https://github.com/nfarina/homebridge) adds support for AEG Wellbeing Air Purifiers and all their sensors (Air Quality, Temperature, Humidity, CO2, Filter Life) to your Home app. This plugin has been tested on the following models:

- AEG Wellbeing AX9
- AEG Wellbeing AX5

If you have another model in the range and it works for you, please add it to this list.

## Configuration
To configure the plugin, use the Homebridge UI to set your username and password, which are the same credentials you use in the AEG Wellbeing App.

### Ionizer
Please note that ionizer is currently not supported in HomeKit, so we have mapped it to Swing Mode. Use oscilliator/swing mode to control the ionizer on/off.

---

This plugin is a fork of [homebridge-electrolux-wellbeing](https://github.com/baboons/homebridge-electrolux-wellbeing). It fixes a few bugs and only adds sensors supported by the connected device, which varies by model. If you have an Electrolux Wellbeing Air Purifier, then this plugin should work with your device as both brands use a common API.
