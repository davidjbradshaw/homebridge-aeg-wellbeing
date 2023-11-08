
# Homebridge AEG Wellbeing (deprecated)

*Due to AEG discontining the API this plugin uses, it nolonger works. Going forward it is recommended that you use []() which supports the new API.*

--

The AEG Wellbeing plugin for [Homebridge](https://github.com/nfarina/homebridge) adds support for AEG / Electrolux Wellbeing Air Purifiers and all their sensors (Air Quality, Temperature, Humidity, CO2, Filter Life) to your Home app. This plugin has been tested on the following models:

- AEG Wellbeing AX9 / Electrolux Pure A9
- AEG Wellbeing AX5 / Electrolux Well A5

If you have another model in the range and it works for you, please add it to this list.

## Configuration

Add your AX series air purifier to your AEG/Electrolux account using the [AEG App](https://apps.apple.com/gb/app/aeg/id1599494494). You can then use the Homebridge UI to set your username and password to automatically connect your devices into HomeBridge.


### Ionizer

Please note that ionizer is currently not supported in HomeKit, so we have mapped it to Swing Mode. Use oscilliator/swing mode to control the ionizer on/off.

---

*This plugin is a fork of [homebridge-electrolux-wellbeing](https://github.com/baboons/homebridge-electrolux-wellbeing). It fixes a few bugs and only adds sensors supported by the connected device, which varies by model.*

*AEG and Electrolux are trademarks of [AB Electrolux](https://www.electroluxgroup.com/).*
