import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';

const STORAGE_KEY = '@weather_pulse_cache_v2';
const RECENT_SEARCHES_KEY = '@weather_pulse_recent_searches_v1';
const DEFAULT_CITY = 'Lagos';
const FORECAST_DAYS = 5;
const HOURLY_SLOTS = 12;
const TAB_OPTIONS = ['today', 'hourly', 'daily'];
const WEATHER_STALE_TIME = 1000 * 60 * 10;
const MAX_RECENT_SEARCHES = 5;

const WEATHER_CODE_MAP = {
  0: { label: 'Clear sky', icon: '\u2600', palette: ['#0F4C81', '#6FB7FF'] },
  1: { label: 'Mainly clear', icon: '\u26C5', palette: ['#1B5E9B', '#9AD1FF'] },
  2: { label: 'Partly cloudy', icon: '\u26C5', palette: ['#295C88', '#AACBDE'] },
  3: { label: 'Overcast', icon: '\u2601', palette: ['#475569', '#94A3B8'] },
  45: { label: 'Foggy', icon: '\u2248', palette: ['#4B5563', '#CBD5E1'] },
  48: { label: 'Depositing rime fog', icon: '\u2248', palette: ['#475569', '#D8E2F1'] },
  51: { label: 'Light drizzle', icon: '\u2055', palette: ['#0B5A7A', '#86C6DA'] },
  53: { label: 'Drizzle', icon: '\u2055', palette: ['#0B5A7A', '#5DA9C6'] },
  55: { label: 'Dense drizzle', icon: '\u2055', palette: ['#0B5A7A', '#4B8FB9'] },
  56: { label: 'Freezing drizzle', icon: '\u2744', palette: ['#27548A', '#BFD8FF'] },
  57: { label: 'Heavy freezing drizzle', icon: '\u2744', palette: ['#23406A', '#A6C5FF'] },
  61: { label: 'Light rain', icon: '\u2602', palette: ['#0F3D73', '#75A8D9'] },
  63: { label: 'Rain', icon: '\u2602', palette: ['#0F3D73', '#5E96D1'] },
  65: { label: 'Heavy rain', icon: '\u2602', palette: ['#0C2D57', '#477DC0'] },
  66: { label: 'Freezing rain', icon: '\u2744', palette: ['#274C77', '#B3CAFF'] },
  67: { label: 'Heavy freezing rain', icon: '\u2744', palette: ['#1F3B60', '#95B8FF'] },
  71: { label: 'Light snow', icon: '\u2744', palette: ['#406882', '#DDEAF7'] },
  73: { label: 'Snow', icon: '\u2744', palette: ['#3B6177', '#CADAEA'] },
  75: { label: 'Heavy snow', icon: '\u2744', palette: ['#35566A', '#BFD4E4'] },
  77: { label: 'Snow grains', icon: '\u2744', palette: ['#3D607A', '#D7E5F2'] },
  80: { label: 'Rain showers', icon: '\u2602', palette: ['#124E78', '#6AA4C2'] },
  81: { label: 'Strong showers', icon: '\u2602', palette: ['#0E4367', '#4C8CB0'] },
  82: { label: 'Violent showers', icon: '\u2602', palette: ['#0A3653', '#41779A'] },
  85: { label: 'Snow showers', icon: '\u2744', palette: ['#3A6079', '#D5E4F1'] },
  86: { label: 'Heavy snow showers', icon: '\u2744', palette: ['#31526A', '#C2D8EC'] },
  95: { label: 'Thunderstorm', icon: '\u26A1', palette: ['#36245D', '#7C69C6'] },
  96: { label: 'Storm with hail', icon: '\u26A1', palette: ['#311E57', '#6E5AB7'] },
  99: { label: 'Heavy storm with hail', icon: '\u26A1', palette: ['#27184A', '#5D4AA7'] },
};

const getWeatherMeta = (code) => WEATHER_CODE_MAP[code] || { label: 'Weather update', icon: '\u2601', palette: ['#334155', '#94A3B8'] };

const formatWeekday = (dateString) =>
  new Date(dateString).toLocaleDateString(undefined, { weekday: 'short' });

const formatFullDate = (dateString) =>
  new Date(dateString).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

const formatHour = (dateString) =>
  new Date(dateString).toLocaleTimeString(undefined, { hour: 'numeric' });

const toRoundedValue = (value) => Math.round(Number(value ?? 0));
const formatRelativeUpdate = (timestamp) => {
  if (!timestamp) {
    return 'Updated just now';
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) {
    return 'Updated just now';
  }
  if (diffMinutes === 1) {
    return 'Updated 1 min ago';
  }
  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} mins ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) {
    return 'Updated 1 hour ago';
  }

  return `Updated ${diffHours} hours ago`;
};

const buildHourlyItems = (hourly) => {
  if (!hourly?.time?.length) {
    return [];
  }

  const currentTime = Date.now();
  const result = [];

  for (let index = 0; index < hourly.time.length; index += 1) {
    const slotTime = new Date(hourly.time[index]).getTime();
    if (slotTime >= currentTime) {
      result.push({
        time: hourly.time[index],
        temperature: toRoundedValue(hourly.temperature_2m[index]),
        humidity: toRoundedValue(hourly.relative_humidity_2m[index]),
        weatherCode: hourly.weather_code[index],
      });
    }

    if (result.length === HOURLY_SLOTS) {
      break;
    }
  }

  return result;
};

const buildDailyItems = (daily) => {
  if (!daily?.time?.length) {
    return [];
  }

  return daily.time.slice(0, FORECAST_DAYS).map((time, index) => ({
    time,
    weatherCode: daily.weather_code[index],
    max: toRoundedValue(daily.temperature_2m_max[index]),
    min: toRoundedValue(daily.temperature_2m_min[index]),
    rainChance: toRoundedValue(daily.precipitation_probability_max[index]),
  }));
};

const hydratePayload = (payload) => {
  const current = payload?.current ?? null;
  const hourlyItems = buildHourlyItems(payload?.hourly);
  const dailyItems = buildDailyItems(payload?.daily);
  const city = payload?.city ?? DEFAULT_CITY;
  const meta = getWeatherMeta(current?.weather_code);

  return {
    city,
    current,
    hourlyItems,
    dailyItems,
    updatedAt: payload?.updatedAt ?? Date.now(),
    latitude: payload?.latitude,
    longitude: payload?.longitude,
    meta,
  };
};

const resolveErrorMessage = (error) => {
  if (axios.isAxiosError(error) && !error.response) {
    return 'No internet connection. Showing cached weather if available.';
  }

  return 'Weather service is unavailable right now. Retry in a moment.';
};

const createTaggedError = (code, message) => Object.assign(new Error(message), { code });

const restoreCache = async () => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (!cached) {
      return null;
    }

    return JSON.parse(cached);
  } catch (storageError) {
    console.warn('Failed to restore cache', storageError);
    return null;
  }
};

const saveCache = async (payload) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (storageError) {
    console.warn('Failed to save cache', storageError);
  }
};

const restoreRecentSearches = async () => {
  try {
    const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (storageError) {
    console.warn('Failed to restore recent searches', storageError);
    return [];
  }
};

const saveRecentSearches = async (items) => {
  try {
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items));
  } catch (storageError) {
    console.warn('Failed to save recent searches', storageError);
  }
};

const fetchWeatherPayload = async ({ latitude, longitude, city }) => {
  const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude,
      longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,relative_humidity_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: FORECAST_DAYS,
      timezone: 'auto',
    },
  });

  return {
    ...response.data,
    city,
    latitude,
    longitude,
    updatedAt: Date.now(),
  };
};

const resolveCityCoordinates = async (cityName) => {
  const geoResponse = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
    params: {
      name: cityName,
      count: 1,
      language: 'en',
      format: 'json',
    },
  });

  const match = geoResponse.data?.results?.[0];
  if (!match) {
    throw createTaggedError(
      'CITY_NOT_FOUND',
      'I could not find that city. Check the spelling or try a more specific search.',
    );
  }

  const labelParts = [match.name, match.admin1, match.country].filter(Boolean);

  return {
    latitude: match.latitude,
    longitude: match.longitude,
    city: labelParts.join(', '),
  };
};

const resolveCurrentLocationTarget = async () => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw createTaggedError(
      'LOCATION_PERMISSION_DENIED',
      'Location access is off, so I switched to Lagos for your forecast.',
    );
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const places = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  const place = places?.[0];
  const city =
    place?.city ||
    place?.district ||
    place?.region ||
    place?.subregion ||
    'Current location';

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    city,
  };
};

function SkeletonBlock({ style }) {
  return <View style={[styles.skeletonBlock, style]} />;
}

function EmptyState({ title, body, actionLabel, onPress }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel ? (
        <Pressable style={styles.retryButton} onPress={onPress}>
          <Text style={styles.retryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [weatherTarget, setWeatherTarget] = useState(null);
  const [weatherBundle, setWeatherBundle] = useState(null);
  const [cacheBundle, setCacheBundle] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const [recentSearches, setRecentSearches] = useState([]);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const heroAnim = useRef(new Animated.Value(0)).current;
  const iconAnim = useRef(new Animated.Value(0.92)).current;
  const iconFloatAnim = useRef(new Animated.Value(0)).current;
  const iconTiltAnim = useRef(new Animated.Value(0)).current;
  const iconOpacityAnim = useRef(new Animated.Value(1)).current;
  const contentAnim = useRef(new Animated.Value(1)).current;
  const refreshBannerAnim = useRef(new Animated.Value(0)).current;
  const hourlyAnims = useRef([]);
  const dailyAnims = useRef([]);
  const iconLoopRef = useRef(null);

  const locationMutation = useMutation({
    mutationFn: resolveCurrentLocationTarget,
  });

  const citySearchMutation = useMutation({
    mutationFn: resolveCityCoordinates,
  });

  const weatherQuery = useQuery({
    queryKey: ['weather', weatherTarget],
    queryFn: ({ queryKey }) => fetchWeatherPayload(queryKey[1]),
    enabled: Boolean(weatherTarget),
    staleTime: WEATHER_STALE_TIME,
    retry: 1,
  });

  const refreshing =
    locationMutation.isPending || citySearchMutation.isPending || weatherQuery.isFetching;
  const loading = (bootstrapping || weatherQuery.isFetching) && !weatherBundle;

  useEffect(() => {
    const bootstrapWeather = async () => {
      const [cached, recent] = await Promise.all([restoreCache(), restoreRecentSearches()]);
      setRecentSearches(recent);
      if (cached) {
        const hydrated = hydratePayload(cached);
        setCacheBundle(hydrated);
        setWeatherBundle(hydrated);
        setOfflineMode(true);
      }

      await loadCurrentLocationWeather();
      setBootstrapping(false);
    };

    bootstrapWeather();
  }, []);

  useEffect(() => {
    if (!weatherBundle) {
      return;
    }

    heroAnim.setValue(0);
    iconAnim.setValue(0.92);
    iconFloatAnim.setValue(0);
    iconTiltAnim.setValue(0);
    iconOpacityAnim.setValue(1);

    if (iconLoopRef.current) {
      iconLoopRef.current.stop();
      iconLoopRef.current = null;
    }

    Animated.parallel([
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(iconAnim, {
          toValue: 1.08,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(iconAnim, {
          toValue: 1,
          friction: 5,
          tension: 70,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const weatherCode = weatherBundle?.current?.weather_code;
    if (weatherCode === 0 || weatherCode === 1 || weatherCode === 2) {
      iconLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(iconFloatAnim, {
            toValue: -6,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(iconFloatAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
    } else if ([61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherCode)) {
      iconLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(iconTiltAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(iconTiltAnim, {
            toValue: -1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(iconTiltAnim, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
    } else if ([3, 45, 48].includes(weatherCode)) {
      iconLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(iconOpacityAnim, {
            toValue: 0.72,
            duration: 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(iconOpacityAnim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
    }

    if (iconLoopRef.current) {
      iconLoopRef.current.start();
    }

    return () => {
      if (iconLoopRef.current) {
        iconLoopRef.current.stop();
        iconLoopRef.current = null;
      }
    };
  }, [heroAnim, iconAnim, iconFloatAnim, iconTiltAnim, iconOpacityAnim, weatherBundle]);

  useEffect(() => {
    hourlyAnims.current = weatherBundle?.hourlyItems?.map(() => new Animated.Value(0)) || [];
    dailyAnims.current = weatherBundle?.dailyItems?.map(() => new Animated.Value(0)) || [];

    Animated.stagger(
      60,
      [...hourlyAnims.current, ...dailyAnims.current].map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [weatherBundle]);

  useEffect(() => {
    contentAnim.setValue(0);
    Animated.timing(contentAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [activeTab, contentAnim]);

  useEffect(() => {
    Animated.timing(refreshBannerAnim, {
      toValue: refreshing ? 1 : 0,
      duration: refreshing ? 220 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [refreshBannerAnim, refreshing]);

  useEffect(() => {
    if (!weatherQuery.data) {
      return;
    }

    const hydrated = hydratePayload(weatherQuery.data);
    setWeatherBundle(hydrated);
    setCacheBundle(hydrated);
    setOfflineMode(false);
    saveCache(weatherQuery.data);
  }, [weatherQuery.data]);

  useEffect(() => {
    if (!weatherQuery.error) {
      return;
    }

    setError(resolveErrorMessage(weatherQuery.error));
    if (cacheBundle) {
      setWeatherBundle(cacheBundle);
      setOfflineMode(true);
    }
  }, [cacheBundle, weatherQuery.error]);

  const searchAndLoadWeather = async (cityName, options = {}) => {
    const { clearError = true, fallback = false, rememberSearch = true } = options;

    if (clearError) {
      setError('');
    }

    setOfflineMode(false);

    try {
      const target = await citySearchMutation.mutateAsync(cityName);
      if (rememberSearch) {
        const nextRecentSearches = [cityName, ...recentSearches.filter((item) => item.toLowerCase() !== cityName.toLowerCase())]
          .slice(0, MAX_RECENT_SEARCHES);
        setRecentSearches(nextRecentSearches);
        saveRecentSearches(nextRecentSearches);
      }
      setWeatherTarget(target);
    } catch (searchError) {
      if (searchError?.code === 'CITY_NOT_FOUND') {
        setError(searchError.message);
      } else if (fallback) {
        setError('I could not load Lagos online, so I am showing your saved forecast if one is available.');
      } else {
        setError(resolveErrorMessage(searchError));
      }

      if (cacheBundle) {
        setWeatherBundle(cacheBundle);
        setOfflineMode(true);
      }
    }
  };

  const loadCurrentLocationWeather = async () => {
    setError('');
    setPermissionDenied(false);
    setOfflineMode(false);

    try {
      const target = await locationMutation.mutateAsync();
      setWeatherTarget(target);
    } catch (locationError) {
      if (locationError?.code === 'LOCATION_PERMISSION_DENIED') {
        setPermissionDenied(true);
        setError(locationError.message);
      } else {
        console.warn(locationError);
        setError('I could not get your current location, so I switched to Lagos for your forecast.');
      }

      await searchAndLoadWeather(DEFAULT_CITY, {
        clearError: false,
        fallback: true,
        rememberSearch: false,
      });
    }
  };

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError('Please enter a city name so I can fetch a weather forecast for you.');
      return;
    }

    Keyboard.dismiss();
    await searchAndLoadWeather(trimmedQuery);
    setQuery('');
  };

  const handleRecentSearchPress = async (cityName) => {
    setQuery(cityName);
    await searchAndLoadWeather(cityName);
    setQuery('');
  };

  const isCacheStale =
    offlineMode && weatherBundle?.updatedAt && Date.now() - weatherBundle.updatedAt > WEATHER_STALE_TIME;

  const handleRetry = async () => {
    if (weatherTarget) {
      setError('');
      setOfflineMode(false);
      await weatherQuery.refetch();
      return;
    }

    await loadCurrentLocationWeather();
  };

  const handlePullToRefresh = async () => {
    setIsPullRefreshing(true);
    try {
      await handleRetry();
    } finally {
      setTimeout(() => {
        setIsPullRefreshing(false);
      }, 350);
    }
  };

  const renderTodayTab = () => {
    if (!weatherBundle?.current) {
      return (
        <EmptyState
          title="No weather loaded yet"
          body="Search for a city or use your current location to see the latest weather."
          actionLabel="Use my location"
          onPress={loadCurrentLocationWeather}
        />
      );
    }

    const statCards = [
      {
        label: 'Feels like',
        value: `${toRoundedValue(weatherBundle.current.apparent_temperature)}°`,
      },
      {
        label: 'Humidity',
        value: `${toRoundedValue(weatherBundle.current.relative_humidity_2m)}%`,
      },
      {
        label: 'Wind',
        value: `${toRoundedValue(weatherBundle.current.wind_speed_10m)} km/h`,
      },
      {
        label: 'Rain',
        value: `${toRoundedValue(weatherBundle.current.precipitation)} mm`,
      },
    ];

    return (
      <View style={styles.todayGrid}>
        {statCards.map((item) => (
          <View key={item.label} style={styles.statCard}>
            <Text style={styles.statCardValue}>{item.value}</Text>
            <Text style={styles.statCardLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderHourlyTab = () => {
    if (!weatherBundle?.hourlyItems?.length) {
      return (
        <EmptyState
          title="Hourly forecast unavailable"
          body="Refresh to load the latest hour-by-hour weather updates."
          actionLabel="Refresh"
          onPress={handleRetry}
        />
      );
    }

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
        {weatherBundle.hourlyItems.map((item, index) => {
          const anim = hourlyAnims.current[index] || new Animated.Value(1);
          const meta = getWeatherMeta(item.weatherCode);

          return (
            <Animated.View
              key={`${item.time}-${index}`}
              style={[
                styles.hourlyCard,
                {
                  opacity: anim,
                  transform: [
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [22, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.hourlyTime}>{formatHour(item.time)}</Text>
              <Text style={styles.hourlyIcon}>{meta.icon}</Text>
              <Text style={styles.hourlyTemp}>{item.temperature}°</Text>
              <Text style={styles.hourlyLabel}>{meta.label}</Text>
              <Text style={styles.hourlyMeta}>{item.humidity}% humidity</Text>
            </Animated.View>
          );
        })}
      </ScrollView>
    );
  };

  const renderDailyTab = () => {
    if (!weatherBundle?.dailyItems?.length) {
      return (
        <EmptyState
          title="Daily forecast unavailable"
          body="Refresh to load the latest forecast for the next few days."
          actionLabel="Refresh"
          onPress={handleRetry}
        />
      );
    }

    return (
      <View style={styles.dailyList}>
        {weatherBundle.dailyItems.map((item, index) => {
          const anim = dailyAnims.current[index] || new Animated.Value(1);
          const meta = getWeatherMeta(item.weatherCode);

          return (
            <Animated.View
              key={`${item.time}-${index}`}
              style={[
                styles.dailyCard,
                {
                  opacity: anim,
                  transform: [
                    {
                      translateX: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View>
                <Text style={styles.dailyDay}>{formatWeekday(item.time)}</Text>
                <Text style={styles.dailyDate}>{formatFullDate(item.time)}</Text>
              </View>
              <View style={styles.dailyMiddle}>
                <Text style={styles.dailyIcon}>{meta.icon}</Text>
                <Text style={styles.dailySummary}>{meta.label}</Text>
              </View>
              <View style={styles.dailyRight}>
                <Text style={styles.dailyTemp}>{item.max}° / {item.min}°</Text>
                <Text style={styles.dailyRain}>{item.rainChance}% rain</Text>
              </View>
            </Animated.View>
          );
        })}
      </View>
    );
  };

  const renderTabContent = () => {
    if (activeTab === 'hourly') {
      return renderHourlyTab();
    }

    if (activeTab === 'daily') {
      return renderDailyTab();
    }

    return renderTodayTab();
  };

  const palette = weatherBundle?.meta?.palette || ['#12355B', '#4F86C6'];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing || refreshing}
            onRefresh={handlePullToRefresh}
            tintColor="#7DD3FC"
            colors={['#7DD3FC', '#38BDF8']}
            progressBackgroundColor="#10233A"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>The Fourth</Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a city"
            placeholderTextColor="#6B7280"
            returnKeyType="search"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
          />
          <Pressable style={styles.primaryButton} onPress={handleSearch}>
            <Text style={styles.primaryButtonText}>Search</Text>
          </Pressable>
        </View>

        {recentSearches.length ? (
          <View style={styles.recentSearchesSection}>
            <Text style={styles.recentSearchesLabel}>Recent searches</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentSearchesRow}>
              {recentSearches.map((cityName) => (
                <Pressable key={cityName} style={styles.recentSearchChip} onPress={() => handleRecentSearchPress(cityName)}>
                  <Text style={styles.recentSearchChipText}>{cityName}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.secondaryButton} onPress={loadCurrentLocationWeather}>
            <Text style={styles.secondaryButtonText}>Use my location</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={handleRetry}>
            <View style={styles.refreshButtonContent}>
              {refreshing ? <ActivityIndicator size="small" color="#7DD3FC" /> : null}
              <Text style={styles.ghostButtonText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
            </View>
          </Pressable>
        </View>

        {permissionDenied ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerText}>Location access is off. You can still search for any city manually.</Text>
          </View>
        ) : null}

        {offlineMode ? (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>You are offline, so I am showing the last forecast saved on this device.</Text>
          </View>
        ) : null}

        {refreshing ? (
          <Animated.View
            style={[
              styles.refreshBanner,
              {
                opacity: refreshBannerAnim,
                transform: [
                  {
                    translateY: refreshBannerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <ActivityIndicator size="small" color="#A5F3FC" />
            <Text style={styles.refreshBannerText}>Refreshing weather...</Text>
          </Animated.View>
        ) : null}

        {isCacheStale ? (
          <View style={styles.staleBanner}>
            <Text style={styles.staleBannerText}>Saved forecast may be outdated. Pull down or tap refresh when you are back online.</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Weather update interrupted</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Refresh now</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && !weatherBundle ? (
          <View style={styles.loadingCard}>
            <SkeletonBlock style={styles.heroSkeletonTop} />
            <SkeletonBlock style={styles.heroSkeletonIcon} />
            <SkeletonBlock style={styles.heroSkeletonTemp} />
            <View style={styles.skeletonRow}>
              <SkeletonBlock style={styles.statSkeleton} />
              <SkeletonBlock style={styles.statSkeleton} />
            </View>
            <ActivityIndicator size="small" color="#1D4ED8" style={styles.loadingSpinner} />
          </View>
        ) : (
          <Animated.View
            style={[
              styles.heroCard,
              {
                backgroundColor: palette[0],
                shadowColor: palette[0],
                opacity: heroAnim,
                transform: [
                  {
                    translateY: heroAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [26, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.heroGlow, { backgroundColor: palette[1] }]} />
            <Text style={styles.heroLocation}>{weatherBundle?.city || DEFAULT_CITY}</Text>
            <Text style={styles.heroDate}>
              {weatherBundle?.dailyItems?.[0]?.time ? formatFullDate(weatherBundle.dailyItems[0].time) : 'Forecast'}
            </Text>
            <Animated.View
              style={[
                styles.heroIconWrap,
                {
                  opacity: iconOpacityAnim,
                  transform: [
                    { scale: iconAnim },
                    { translateY: iconFloatAnim },
                    {
                      rotate: iconTiltAnim.interpolate({
                        inputRange: [-1, 0, 1],
                        outputRange: ['-4deg', '0deg', '4deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.heroIcon}>{weatherBundle?.meta?.icon || '\u2601'}</Text>
            </Animated.View>
            <Text style={styles.heroTemp}>
              {weatherBundle?.current ? `${toRoundedValue(weatherBundle.current.temperature_2m)}°` : '--'}
            </Text>
            <Text style={styles.heroCondition}>{weatherBundle?.meta?.label || 'Forecast loading'}</Text>
            <Text style={styles.heroMeta}>
              {weatherBundle?.updatedAt
                ? formatRelativeUpdate(weatherBundle.updatedAt)
                : 'Preparing weather feed'}
            </Text>
          </Animated.View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Forecast breakdown</Text>
          <Text style={styles.sectionCaption}>Switch between current conditions, hourly updates, and the next few days.</Text>
        </View>

        <View style={styles.tabRow}>
          {TAB_OPTIONS.map((tab) => {
            const isActive = activeTab === tab;

            return (
              <Pressable
                key={tab}
                style={[styles.tabButton, isActive ? styles.tabButtonActive : null]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabButtonText, isActive ? styles.tabButtonTextActive : null]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Animated.View
          style={[
            styles.tabContentCard,
            {
              opacity: contentAnim,
              transform: [
                {
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {renderTabContent()}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07111F',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 18,
  },
  eyebrow: {
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: '#B6C2D2',
    lineHeight: 22,
    maxWidth: '92%',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  recentSearchesSection: {
    marginBottom: 14,
  },
  recentSearchesLabel: {
    color: '#9DB1C7',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  recentSearchesRow: {
    paddingRight: 8,
  },
  recentSearchChip: {
    backgroundColor: '#10233A',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
  },
  recentSearchChipText: {
    color: '#DDE9F7',
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#0F172A',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 18,
    borderRadius: 18,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#082F49',
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#11243D',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1E3A5F',
  },
  secondaryButtonText: {
    color: '#DDE9F7',
    fontWeight: '700',
    textAlign: 'center',
  },
  ghostButton: {
    width: 110,
    backgroundColor: '#0D1B2A',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#223B59',
  },
  ghostButtonText: {
    color: '#7DD3FC',
    fontWeight: '700',
    textAlign: 'center',
  },
  refreshButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  warningBanner: {
    backgroundColor: '#3C2A15',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  warningBannerText: {
    color: '#FDE68A',
    fontWeight: '600',
    lineHeight: 20,
  },
  offlineBanner: {
    backgroundColor: '#0B2C3B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: '#A5F3FC',
    fontWeight: '600',
  },
  refreshBanner: {
    backgroundColor: '#0A2633',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refreshBannerText: {
    color: '#A5F3FC',
    fontWeight: '600',
  },
  staleBanner: {
    backgroundColor: '#3B2D12',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  staleBannerText: {
    color: '#FDE68A',
    fontWeight: '600',
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: '#33161C',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#5E1B27',
  },
  errorTitle: {
    color: '#FECACA',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorBody: {
    color: '#F8B4B4',
    lineHeight: 20,
    marginBottom: 12,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#0F172A',
    fontWeight: '800',
  },
  loadingCard: {
    backgroundColor: '#EAF3FF',
    borderRadius: 32,
    padding: 22,
    marginBottom: 22,
  },
  skeletonBlock: {
    backgroundColor: '#D1E3FA',
    borderRadius: 16,
  },
  heroSkeletonTop: {
    width: '56%',
    height: 20,
    marginBottom: 18,
  },
  heroSkeletonIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignSelf: 'center',
    marginBottom: 18,
  },
  heroSkeletonTemp: {
    width: '42%',
    height: 38,
    alignSelf: 'center',
    marginBottom: 18,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statSkeleton: {
    flex: 1,
    height: 72,
  },
  loadingSpinner: {
    marginTop: 18,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 32,
    padding: 24,
    marginBottom: 22,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -40,
    top: -60,
    opacity: 0.35,
  },
  heroLocation: {
    color: '#E0F2FE',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroDate: {
    color: '#C4E8FF',
    fontSize: 13,
    marginBottom: 18,
  },
  heroIconWrap: {
    alignSelf: 'center',
    marginBottom: 10,
  },
  heroIcon: {
    fontSize: 72,
    color: '#F8FAFC',
  },
  heroTemp: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 72,
  },
  heroCondition: {
    color: '#E0F2FE',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroMeta: {
    color: '#CBE9FF',
    textAlign: 'center',
    fontSize: 12,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionCaption: {
    color: '#9DB1C7',
    lineHeight: 20,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#0D1B2A',
    borderRadius: 20,
    padding: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1C3149',
  },
  tabButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
  },
  tabButtonActive: {
    backgroundColor: '#38BDF8',
  },
  tabButtonText: {
    textAlign: 'center',
    color: '#8CA4BC',
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#082F49',
  },
  tabContentCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    padding: 18,
  },
  todayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#E6F0FB',
    borderRadius: 22,
    padding: 16,
  },
  statCardValue: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  statCardLabel: {
    color: '#496179',
    fontWeight: '600',
  },
  horizontalList: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  hourlyCard: {
    width: 136,
    backgroundColor: '#E7F0FB',
    borderRadius: 24,
    padding: 16,
    marginRight: 12,
  },
  hourlyTime: {
    color: '#26415E',
    fontWeight: '700',
    marginBottom: 12,
  },
  hourlyIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  hourlyTemp: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 6,
  },
  hourlyLabel: {
    color: '#35516F',
    fontSize: 12,
    lineHeight: 18,
    minHeight: 36,
  },
  hourlyMeta: {
    marginTop: 10,
    color: '#61768E',
    fontSize: 12,
  },
  dailyList: {
    gap: 12,
  },
  dailyCard: {
    backgroundColor: '#EAF2FC',
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dailyDay: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  dailyDate: {
    color: '#60758E',
    fontSize: 12,
    marginTop: 4,
  },
  dailyMiddle: {
    alignItems: 'center',
    flex: 1,
  },
  dailyIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  dailySummary: {
    color: '#35516F',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 90,
  },
  dailyRight: {
    alignItems: 'flex-end',
  },
  dailyTemp: {
    color: '#0F172A',
    fontWeight: '800',
    marginBottom: 4,
  },
  dailyRain: {
    color: '#60758E',
    fontSize: 12,
  },
  emptyState: {
    paddingVertical: 18,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyBody: {
    color: '#5B7088',
    lineHeight: 20,
    marginBottom: 14,
  },
});
