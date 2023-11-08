import { AxiosInstance } from 'axios'
import {
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
} from 'homebridge'
import find from 'lodash/find'

import createClient from './api'
import { MANUFACTURER, MODEL_PREFIX, PLATFORM_NAME, PLUGIN_NAME } from './brand'
import { Appliance, WellbeingApi, WorkModes } from './types'

// AX9 fans support speeds from [1, 9].
const FAN_SPEED_MULTIPLIER = 100 / 9 // eslint-disable-line const-case/uppercase

let hap: HAP
let Service
let Characteristic
let Accessory: typeof PlatformAccessory

const getSupportedFeatues = (obj) =>
  Object.entries(obj)
    .filter(([, /* key */ value]) => value !== undefined)
    .map(([key]) => key)

const arrayToObject = (arr) => {
  const obj = {}
  arr.forEach((element) => (obj[element] = true)) // eslint-disable-line no-return-assign
  return obj
}

const fixModelPrefix = (model) => `${MODEL_PREFIX}${model.match(/(\d+)/)[0]}`

class wellbeingPlatform implements DynamicPlatformPlugin {
  private client?: AxiosInstance

  private readonly log: Logging

  private readonly api: API

  private readonly config: PlatformConfig

  private readonly accessories: PlatformAccessory[] = []

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log
    this.api = api
    this.config = config

    api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {

      this.log.warn('AEG have discontinued the Wellbeing API, this plugin will no longer work.')
      this.log.warn('Support for the replacement API is provided by homebridge-electrolux-devices.')

      if (this.needsConfiguration()) {
        this.log('Please configure this plugin first.')
        return
      }

      // this.removeAccessories();

      try {
        this.client = await this.connect()
      } catch (error) {
        return
      }

      const appliances = await this.getAllAppliances()
      const applianceData = await Promise.all(appliances.map((appliance) => this.fetchApplianceData(appliance.pncId)))

      this.log.debug('Fetched appliances: ', appliances)
      this.log.debug('Fetched data: ', applianceData)

      appliances.forEach(({ applianceName, modelName, pncId }, i) => {
        this.addAccessory({
          pncId,
          name: applianceName,
          modelName,
          firmwareVersion: applianceData[i]?.firmwareVersion,
          features: getSupportedFeatues(applianceData[i]),
        })
      })

      this.updateValues(applianceData)
      setInterval(() => this.checkAppliances(), this.getPollTime(this.config.pollTime))
    })
  }

  async connect() {
    try {
      return await createClient({
        username: this.config.username,
        password: this.config.password,
        log: this.log,
      })
    } catch (error) {
      this.log.debug('Error while creating client', error)
      throw error
    }
  }

  needsConfiguration(): boolean {
    return !this.config.username || !this.config.password
  }

  getPollTime(pollTime): number {
    if (!pollTime || pollTime < 5) {
      this.log.warn('Set poll time is below 5s, forcing 5s')
      return 5 * 1000
    }

    this.log.debug(`Refreshing every ${pollTime}s`)
    return pollTime * 1000
  }

  async checkAppliances() {
    const data = await this.fetchAppliancesData()

    this.log.debug('Fetched: ', data)
    this.updateValues(data)
  }

  async fetchAppliancesData() {
    return Promise.all(this.accessories.map((accessory) => this.fetchApplianceData(accessory.context.pncId)))
  }

  async fetchApplianceData(pncId: string): Promise<Appliance | undefined> {
    try {
      const response: { data: WellbeingApi.ApplianceData } = await this.client!.get(`/Appliances/${pncId}`)
      const { reported } = response.data.twin.properties

      this.log.debug('API response.data:', response.data)
      this.log.debug('API reported:', reported)

      return {
        pncId,
        name: response.data.applianceData.applianceName,
        modelName: response.data.applianceData.modelName,
        firmwareVersion: reported.FrmVer_NIU,
        workMode: reported.Workmode,
        filterRFID: reported.FilterRFID,
        filterLife: reported.FilterLife,
        fanSpeed: reported.Fanspeed,
        UILight: reported.UILight,
        safetyLock: reported.SafetyLock,
        ionizer: reported.Ionizer,
        sleep: reported.Sleep,
        scheduler: reported.Scheduler,
        filterType: reported.FilterType,
        version: reported.$version,
        doorOpen: reported.DoorOpen,
        pm1: reported.PM1,
        pm25: reported.PM2_5,
        pm10: reported.PM10,
        tvoc: reported.TVOC,
        co2: reported.CO2,
        temp: reported.Temp,
        humidity: reported.Humidity,
        envLightLevel: reported.EnvLightLvl,
        rssi: reported.RSSI,
      }
    } catch (error) {
      this.log.warn(`Could not fetch appliances data: ${error}`)
      try {
        this.client = await this.connect()
      } catch (error) {
        this.log.error('Recoonection failure')
      }
    }

    return undefined
  }

  async getAllAppliances() {
    try {
      const response: { data: WellbeingApi.Appliance[] } = await this.client!.get('/Domains/Appliances')
      return response.data
    } catch (error) {
      this.log.error(`Could not fetch appliances: ${error}`)
      return []
    }
  }

  async sendCommand(pncId: string, command: string, value: CharacteristicValue) {
    this.log.debug('sending command', {
      [command]: value,
    })

    try {
      const response = await this.client!.put(`/Appliances/${pncId}/Commands`, {
        [command]: value,
      })
      this.log.debug('command responded', response.data)
    } catch (error) {
      this.log.error('Could run command', error)
    }
  }

  updateValues(data) {
    // eslint-disable-next-line sonarjs/cognitive-complexity
    this.accessories.forEach((accessory) => {
      const { pncId } = accessory.context
      const state = this.getApplianceState(pncId, data)

      // Guard against missing data due to API request failure.
      if (!state || !state.name) {
        this.log.debug(`No appliance data returned by API for ${pncId}`)
        return
      }

      const features = arrayToObject(getSupportedFeatues(state))

      this.log.debug('state:', state)
      this.log.debug('featues:', features)

      // Keep firmware revision up-to-date in case the device is updated.
      accessory
        .getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.FirmwareRevision, state.firmwareVersion)

      if ('temp' in features)
        accessory
          .getService(Service.TemperatureSensor)!
          .updateCharacteristic(Characteristic.CurrentTemperature, state.temp)

      if ('humidity' in features)
        accessory
          .getService(Service.HumiditySensor)!
          .updateCharacteristic(Characteristic.CurrentRelativeHumidity, state.humidity)

      if ('co2' in features)
        accessory
          .getService(Service.CarbonDioxideSensor)!
          .updateCharacteristic(Characteristic.CarbonDioxideLevel, state.co2)

      // if('doorOpen' in features && !accessory.getService(Service.ContactSensor))
      //   accessory.addService(Service.ContactSensor, 'Filter Door')

      // if('doorOpen' in features) accessory
      //   .getService(Service.DoorSensor)!
      //   .updateCharacteristic(Characteristic.PositionState,
      //     Characteristic.PositionState.STOPPED)

      if ('envLightLevel' in features) {
        // Env Light Level needs to be tested with lux meter
        accessory.getService(Service.LightSensor)!.updateCharacteristic(
          Characteristic.CurrentAmbientLightLevel,
          // Can someone kindly explain why TS is upset about this, but none
          // of the other places that updateCharacteristic is called ????
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          state.envLightLevel
        )
      }

      const airQualitySensor = accessory.getService(Service.AirQualitySensor)!

      if ('pm25' in features)
        airQualitySensor
          .updateCharacteristic(Characteristic.AirQuality, this.getAirQualityLevel(state.pm25))
          .updateCharacteristic(Characteristic.PM2_5Density, state.pm25)

      if ('pm10' in features) airQualitySensor.updateCharacteristic(Characteristic.PM10Density, state.pm10)

      if ('tvoc' in features)
        airQualitySensor.updateCharacteristic(Characteristic.VOCDensity, this.convertTVOCToDensity(state.tvoc))

      const airPurifierSevice = accessory.getService(Service.AirPurifier)!

      if ('workMode' in features)
        airPurifierSevice
          .updateCharacteristic(Characteristic.Active, state.workMode !== WorkModes.Off)
          .updateCharacteristic(Characteristic.CurrentAirPurifierState, this.getAirPurifierState(state.workMode))
          .updateCharacteristic(Characteristic.TargetAirPurifierState, this.getAirPurifierStateTarget(state.workMode))

      if ('fanSpeed' in features)
        airPurifierSevice.updateCharacteristic(Characteristic.RotationSpeed, state.fanSpeed * FAN_SPEED_MULTIPLIER)

      if ('safetyLock' in features)
        airPurifierSevice.updateCharacteristic(Characteristic.LockPhysicalControls, state.safetyLock)

      if ('filterLife' in features)
        airPurifierSevice
          .updateCharacteristic(Characteristic.FilterLifeLevel, state.filterLife)
          .updateCharacteristic(
            Characteristic.FilterChangeIndication,
            state.filterLife < 5
              ? Characteristic.FilterChangeIndication.CHANGE_FILTER
              : Characteristic.FilterChangeIndication.FILTER_OK
          )

      if ('ionizer' in features) airPurifierSevice.updateCharacteristic(Characteristic.SwingMode, state.ionizer)
    })
  }

  getApplianceState(pncId: string, data): Appliance {
    return find(data, { pncId })
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log('Configuring accessory %s', accessory.displayName)

    const { pncId } = accessory.context

    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log('%s identified!', accessory.displayName)
    })

    accessory
      .getService(Service.AirPurifier)!
      .getCharacteristic(Characteristic.Active)
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        const workMode = value === 1 ? WorkModes.Auto : WorkModes.Off

        if (accessory.getService(Service.AirPurifier)!.getCharacteristic(Characteristic.Active).value !== value) {
          this.sendCommand(pncId, 'WorkMode', workMode)
          this.log.info(`%s AirPurifier Active was set to: ${workMode}`, accessory.displayName)
        }

        callback()
      })

    accessory
      .getService(Service.AirPurifier)!
      .getCharacteristic(Characteristic.TargetAirPurifierState)
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        const workMode = value === Characteristic.TargetAirPurifierState.MANUAL ? WorkModes.Manual : WorkModes.Auto
        this.sendCommand(pncId, 'WorkMode', workMode)
        this.log.info(`%s AirPurifier Work Mode was set to: ${workMode}`, accessory.displayName)
        callback()
      })

    accessory
      .getService(Service.AirPurifier)!
      .getCharacteristic(Characteristic.RotationSpeed)
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        const fanSpeed = Math.floor(parseInt(value.toString(), 10) / FAN_SPEED_MULTIPLIER)
        this.sendCommand(pncId, 'FanSpeed', fanSpeed)

        this.log.info(`%s AirPurifier Fan Speed set to: ${fanSpeed}`, accessory.displayName)
        callback()
      })

    accessory
      .getService(Service.AirPurifier)!
      .getCharacteristic(Characteristic.LockPhysicalControls)
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        if (
          accessory.getService(Service.AirPurifier)!.getCharacteristic(Characteristic.LockPhysicalControls).value !==
          value
        ) {
          this.sendCommand(pncId, 'SafetyLock', value)

          this.log.info(`%s AirPurifier Saftey Lock set to: ${value}`, accessory.displayName)
        }
        callback()
      })

    accessory
      .getService(Service.AirPurifier)!
      .getCharacteristic(Characteristic.SwingMode)
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        if (accessory.getService(Service.AirPurifier)!.getCharacteristic(Characteristic.SwingMode).value !== value) {
          this.sendCommand(pncId, 'Ionizer', value)

          this.log.info(`%s AirPurifier Ionizer set to: ${value}`, accessory.displayName)
        }
        callback()
      })

    this.accessories.push(accessory)
  }

  addAccessory({ name, modelName, pncId, firmwareVersion, features }) {
    const uuid = hap.uuid.generate(pncId)
    const hasFeature = arrayToObject(features)

    this.log.debug(modelName, '->', fixModelPrefix(modelName))
    this.log.debug(name, 'features: ', features)

    if (this.isAccessoryRegistered(name, uuid)) {
      this.log.info('Accessory name %s already added, loading from cache ', name)
      return
    }
    this.log.info('Adding new accessory with name %s', name, uuid)
    const accessory = new Accessory(name, uuid)

    accessory.context.pncId = pncId
    this.log.debug('Context:', accessory.context)

    accessory.addService(Service.AirPurifier)
    if ('pm25' in hasFeature) accessory.addService(Service.AirQualitySensor)
    if ('temp' in hasFeature) accessory.addService(Service.TemperatureSensor)
    if ('co2' in hasFeature) accessory.addService(Service.CarbonDioxideSensor)
    if ('humidity' in hasFeature) accessory.addService(Service.HumiditySensor)
    if ('envLightLevel' in hasFeature) accessory.addService(Service.LightSensor)
    if ('doorOpen' in hasFeature) accessory.addService(Service.ContactSensor, 'Filter Door')

    accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, fixModelPrefix(modelName))
      .setCharacteristic(Characteristic.SerialNumber, pncId)
      .setCharacteristic(Characteristic.FirmwareRevision, firmwareVersion)

    this.configureAccessory(accessory)

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
  }

  removeAccessories() {
    this.log.info('Removing all accessories')

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessories)
    this.accessories.splice(0, this.accessories.length)
  }

  isAccessoryRegistered(name: string, uuid: string) {
    return !!find(this.accessories, { UUID: uuid })
  }

  getAirQualityLevel(pm25: number): number {
    switch (true) {
      case pm25 < 6:
        return Characteristic.AirQuality.EXCELLENT

      case pm25 < 12:
        return Characteristic.AirQuality.GOOD

      case pm25 < 36:
        return Characteristic.AirQuality.FAIR

      case pm25 < 50:
        return Characteristic.AirQuality.INFERIOR

      default:
        return Characteristic.AirQuality.POOR
    }

    return Characteristic.AirQuality.UNKNOWN
  }

  getAirPurifierState(workMode: WorkModes): number {
    if (workMode !== WorkModes.Off) {
      return Characteristic.CurrentAirPurifierState.PURIFYING_AIR
    }

    return Characteristic.CurrentAirPurifierState.INACTIVE
  }

  getAirPurifierStateTarget(workMode: WorkModes): number {
    if (workMode === WorkModes.Auto) {
      return Characteristic.TargetAirPurifierState.AUTO
    }

    return Characteristic.TargetAirPurifierState.MANUAL
  }

  // Best effort attempt to convert Wellbeing TVOC ppb reading to μg/m3, but we lack insight into their algorithms
  // or TVOC densities. We assume 1 ppb = 3.243 μg/m3 (see benzene @ 20C [1]) as this produces results (μg/m3) that fit
  // quite well within the defined ranges in [2].
  //
  // Wellbeing defines 1500 ppb as possibly having an effect on health when exposed to these levels for a month, [2]
  // lists 400-500 μg/m3 as _marginal_ which sounds like a close approximation. Here's an example where 1500 ppb falls
  // within the _marginal_ range.
  //
  //   1500 * 3.243 / 10 = 486.45
  //
  // Note: It's uncertain why we have to divide the result by 10 for the values to make sense, perhaps this is a
  // Wellbeing quirk, but at least the values look good.
  //
  // The maximum value shown by Wellbeing is 4000 ppb and the maximum value accepted by HomeKit is 1000 μg/m3, our
  // assumed molecular density may put the value outside of the HomeKit range, but not by much, which seems acceptable:
  //
  //  4000 * 3.243 / 10 = 1297.2
  //
  /* eslint-disable no-secrets/no-secrets */
  //
  // [1] https://uk-air.defra.gov.uk/assets/documents/reports/cat06/0502160851_Conversion_Factors_Between_ppb_and.pdf
  // [2] https://myhealthyhome.info/assets/pdfs/TB531rev2TVOCInterpretation.pdf
  //
  /* eslint-enable no-secrets/no-secrets */
  //
  convertTVOCToDensity(tvocppb: number): number {
    const ugm3 = (tvocppb * 3.243) / 10
    return Math.min(ugm3, 1000)
  }
}

export = (api: API) => {
  hap = api.hap
  Accessory = api.platformAccessory
  Service = hap.Service
  Characteristic = hap.Characteristic
  api.registerPlatform(PLATFORM_NAME, wellbeingPlatform)
}
