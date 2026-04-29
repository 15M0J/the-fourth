# The Fourth

`The Fourth` is a mobile weather forecast app built with Expo and React Native. It delivers current weather, a 12-hour outlook, and a 5-day forecast with offline cache fallback, location-based lookup, manual city search, and animated UI transitions.

## Which app was built

Weather app.

## Features

- Current weather card with temperature, condition, humidity, wind speed, precipitation, and feels-like data
- Location-based weather using device permissions with graceful fallback when permission is denied
- Manual city search powered by Open-Meteo geocoding
- 12-hour forecast and 5-day forecast views
- Offline caching with AsyncStorage so the last successful forecast remains visible without internet
- User-friendly error states for no internet, invalid searches, and denied location access
- Loading skeleton for the initial fetch and retry controls for refresh flows

## APIs used

- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/) for device coordinates and reverse geocoding

## Animation highlights

- The main hero weather card fades and slides into view after each successful fetch
- The weather icon scales in with a pulse when fresh data loads
- Hourly forecast cards animate upward into place with staggered entrance timing
- Daily forecast rows slide in horizontally
- The segmented forecast content transitions when switching between `Today`, `Hourly`, and `Daily`

## Offline caching and error handling

- Every successful forecast is cached in `AsyncStorage`
- If a network request fails, the app restores the last saved forecast and clearly marks offline mode
- If location access is denied, the app falls back to a default city and shows a banner explaining the state
- Invalid city searches show an actionable message instead of leaving the UI blank

## Libraries and dependencies

- `expo`
- `react-native`
- `axios`
- `@tanstack/react-query`
- `expo-location`
- `@react-native-async-storage/async-storage`

## Architecture

- Single-screen Expo application with local React state
- Weather and geocoding requests handled through Axios
- Server-state fetching and refetch flows managed with TanStack Query
- Cache persistence managed through AsyncStorage
- UI animation handled with React Native `Animated`

## Running locally

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npm start
```

No API key is required because the app uses Open-Meteo.

## Submission notes

- App name: `The Fourth`
- Expo slug: `the-fourth`
- Build link: add the uploaded APK or IPA URL here
- Appetize public preview link: add the generated Appetize share URL here
- Documentation post link: add your LinkedIn or X post URL here
