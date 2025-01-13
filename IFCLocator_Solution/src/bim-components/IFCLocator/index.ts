import * as OBC from "@thatopen/components";
import { LngLatLike } from "maplibre-gl";
import * as WEBIFC from "web-ifc";

interface longlat {
  coords: number[];
  altitude: number;
}

export class IFCLocator extends OBC.Component {
  static readonly uuid = "6c49fd8b-8751-4995-9838-0563c055c8bf" as const;
  enabled = false;

  onMapRequested: OBC.Event<longlat>;

  constructor(components: OBC.Components) {
    super(components);

    components.add(IFCLocator.uuid, this);

    this.onMapRequested = new OBC.Event();
  }

  showModel = async (): Promise<LngLatLike | undefined> => {
    const fragments = this.components.get(OBC.FragmentsManager);

    for (const [_, model] of fragments.groups.entries()) {
      const properties = await model.getAllPropertiesOfType(WEBIFC.IFCSITE);

      if (!properties) continue;

      for (const [_, data] of Object.entries(properties)) {
        if (!data) continue;

        const { RefLatitude, RefLongitude, RefElevation } = data;

        if (!RefLatitude || !RefLongitude || !RefElevation) continue;

        const latitude = this.convertDMStoDecimal(RefLatitude);
        const longitude = this.convertDMStoDecimal(RefLongitude);

        this.onMapRequested.trigger({
          coords: [longitude, latitude],
          altitude: RefElevation.value,
        });
      }
    }

    return undefined;
  };

  async saveCoordinates(
    coords: number[]
  ){

    const fragments = this.components.get(OBC.FragmentsManager);
    const propsManager = this.components.get(OBC.IfcPropertiesManager);

    for (const [_, model] of fragments.groups.entries()) {
      const properties = await model.getAllPropertiesOfType(WEBIFC.IFCSITE);

      if (!properties) continue;

      for (const [_, data] of Object.entries(properties)) {
        if (!data) continue;

        const { RefLatitude, RefLongitude } = data;

        if (!RefLatitude || !RefLongitude) continue;

        data.RefLatitude.value = this.convertDecimalToDMS(coords[0]);
        await propsManager.setData(model, RefLatitude)

        data.RefLongitude.value = this.convertDecimalToDMS(coords[1]);
        await propsManager.setData(model, RefLongitude)
      };
    };
  };

  convertDMStoDecimal(dms: { value: number[] }): number {
    const [degrees, minutes, seconds, milliseconds] = dms.value;
    return degrees + minutes / 60 + (seconds + milliseconds / 1000000) / 3600;
  }

  convertDecimalToDMS(decimal: number): number[] {
    const degrees = Math.trunc(decimal); // Extract the integer part for degrees
    const remainingDecimal = Math.abs(decimal - degrees); // Get the fractional part

    const totalMinutes = remainingDecimal * 60;
    const minutes = Math.trunc(totalMinutes); // Extract the integer part for minutes

    const totalSeconds = (totalMinutes - minutes) * 60;
    const seconds = Math.trunc(totalSeconds); // Extract the integer part for seconds

    const milliseconds = Math.round((totalSeconds - seconds) * 1000); // Calculate milliseconds

    return [degrees, minutes, seconds, milliseconds];
  }

}

export * from "./src";
