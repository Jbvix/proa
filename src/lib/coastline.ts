import { distToPolylineNm } from "./geo.ts";
import { nearestPlaceAny, type NearestPlace } from "./places.ts";

/**
 * Brazilian shoreline, north→south. Ceará is denser because that's the
 * working ground of the tugs. Vertices sit on the water, not city halls.
 */
export const SHORE: Array<[number, number]> = [
  [4.26, -51.62],
  [2.2, -50.5],
  [0.04, -50.5],
  [-0.6, -47.85],
  [-1.45, -48.49],
  [-1.54, -48.75],
  [-0.6, -46.4],
  [-1.2, -44.9],
  [-2.28, -44.38],
  [-2.48, -44.36],
  [-2.53, -44.3],
  [-2.45, -43.4],
  [-2.55, -42.7],
  [-2.75, -41.78],
  [-2.88, -41.3],
  [-2.882, -40.845],
  [-2.85, -40.5],
  [-2.828, -40.145],
  [-2.92, -39.915],
  [-3.02, -39.65],
  [-3.16, -39.38],
  [-3.25, -39.2],
  [-3.4, -39.03],
  [-3.5, -38.9],
  [-3.531, -38.808],
  [-3.58, -38.76],
  [-3.628, -38.722],
  [-3.68, -38.65],
  [-3.71, -38.55],
  [-3.722, -38.494],
  [-3.718, -38.473],
  [-3.735, -38.455],
  [-3.748, -38.445],
  [-3.79, -38.42],
  [-3.85, -38.39],
  [-3.905, -38.38],
  [-4.05, -38.22],
  [-4.25, -38.0],
  [-4.45, -37.8],
  [-4.7, -37.35],
  [-4.96, -36.94],
  [-5.12, -36.5],
  [-5.27, -35.48],
  [-5.6, -35.22],
  [-5.78, -35.19],
  [-6.3, -35.0],
  [-6.98, -34.83],
  [-7.15, -34.82],
  [-8.05, -34.86],
  [-8.4, -34.95],
  [-8.9, -35.1],
  [-9.67, -35.7],
  [-10.3, -36.0],
  [-10.95, -37.05],
  [-12.97, -38.48],
  [-14.0, -38.95],
  [-14.79, -39.03],
  [-16.4, -39.0],
  [-17.7, -39.2],
  [-20.32, -40.3],
  [-21.0, -40.9],
  [-22.0, -41.0],
  [-22.9, -43.16],
  [-23.05, -44.3],
  [-23.8, -45.4],
  [-23.99, -46.3],
  [-24.5, -47.0],
  [-25.5, -48.3],
  [-26.3, -48.6],
  [-26.91, -48.63],
  [-27.6, -48.5],
  [-28.5, -48.8],
  [-29.3, -49.7],
  [-31.4, -51.1],
  [-32.08, -52.1],
  [-33.74, -53.37],
];

export type CoastFix = {
  coastNm: number;
  place: NearestPlace;
  phrase: string;
  label: string;
};

export function distToCoastNm(lat: number, lon: number) {
  return distToPolylineNm(lat, lon, SHORE);
}

export function coastPhrase(name: string, coastNm: number, placeNm: number) {
  const nmi = coastNm.toFixed(1);
  if (coastNm < 0.8) return `na costa, em ${name}`;
  if (placeNm < 2) return `em ${name}, ${nmi} nmi da costa`;
  return `ao largo de ${name}, ${nmi} nmi da costa`;
}

export function coastFix(lat: number, lon: number): CoastFix {
  const place = nearestPlaceAny(lat, lon);
  const coastNm = distToCoastNm(lat, lon);
  return {
    coastNm,
    place,
    phrase: coastPhrase(place.name, coastNm, place.nm),
    label: `${coastNm.toFixed(1)} nmi · ${place.name}`,
  };
}
