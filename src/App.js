import React, { useState, useEffect } from 'react';
// Firebase imports for environment setup, even if not explicitly used for data persistence in this specific app
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

// Recharts for charting
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// 전역 변수 선언 (ESLint no-undef 방지)
const __firebase_config = window.__firebase_config || '{}';
const __initial_auth_token = window.__initial_auth_token || '';
// Firebase 설정 (Canvas 환경에서 제공되는 전역 변수 사용)
// `__firebase_config`와 `__initial_auth_token`은 Canvas 환경에서 자동으로 주입됩니다.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// KMA API Base URL (이것은 예시입니다. 실제 API URL은 KMA API 문서에서 확인하세요.)
const KMA_API_BASE_URL = 'https://apihub.kma.go.kr'; // 실제 API Hub URL을 사용하세요.
const KMA_API_KEY = process.env.REACT_APP_KMA_API_KEY; // 환경 변수에서 API Key 로드

// KMA 단기 예보 API의 좌표 정보를 위한 매핑 (예시)
// 실제 KMA API는 nx, ny 좌표를 사용하며, 이는 기상청의 격자점 정보에서 확인할 수 있습니다.
// 실제 사용 시에는 이 좌표를 정확히 매핑해야 합니다.
const KMA_GRID_POINTS = {
  '대구 (중구)': { nx: 89, ny: 90, regionName: '대구 중구' },
  '대구 (수성구)': { nx: 90, ny: 89, regionName: '대구 수성구' },
  '대구 (달서구)': { nx: 88, ny: 89, regionName: '대구 달서구' },
  '대구 (북구)': { nx: 89, ny: 91, regionName: '대구 북구' },
  '대구 (동구)': { nx: 90, ny: 90, regionName: '대구 동구' },
  '대구 (남구)': { nx: 88, ny: 88, regionName: '대구 남구' },
  '대구 (서구)': { nx: 87, ny: 89, regionName: '대구 서구' },
  '대구 (달성군)': { nx: 85, ny: 86, regionName: '대구 달성군' },
  '구미': { nx: 76, ny: 100, regionName: '구미' },
  '포항': { nx: 102, ny: 95, regionName: '포항' },
  '경주': { nx: 100, ny: 89, regionName: '경주' },
  '안동': { nx: 91, ny: 106, regionName: '안동' },
  '김천': { nx: 77, ny: 97, regionName: '김천' },
  '영천': { nx: 94, ny: 90, regionName: '영천' },
  '청도': { nx: 89, ny: 87, regionName: '청도' },
};

// 라인 차트 색상 팔레트
const LINE_COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00bcd4', '#e91e63', '#9c27b0', '#673ab7'
];

function App() {
  // 지도 표시를 위한 일일 기온 데이터 상태
  const [dailyTemperatureData, setDailyTemperatureData] = useState([]);
  // 지도에 표시할 날짜 선택 상태 (YYYY-MM-DD 형식)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  // 그래프 표시를 위한 선택된 지역 상태 (과거 기온 그래프용)
  const [selectedRegion, setSelectedRegion] = useState('Daegu'); // 기본값: 대구
  // 그래프 표시를 위한 시작 연도 상태
  const [startYear, setStartYear] = useState(new Date().getFullYear() - 5);
  // 그래프 표시를 위한 끝 연도 상태
  const [endYear, setEndYear] = useState(new Date().getFullYear());
  // 그래프 표시를 위한 과거 기온 데이터 상태
  const [historicalTemperatureData, setHistoricalTemperatureData] = useState([]);

  // 단기 예보를 위한 상태
  const [forecastStartDate, setForecastStartDate] = useState(new Date().toISOString().slice(0, 10)); // 예보 시작 날짜
  const [forecastEndDate, setForecastEndDate] = useState(
    new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().slice(0, 10) // 단기 예보는 오늘 포함 최대 3일
  );
  const [baseTime, setBaseTime] = useState('1700'); // 예보 기준 시간 (HHMM)
  // 단기 예보를 위한 다중 지역 선택 (체크박스)
  const [selectedForecastRegions, setSelectedForecastRegions] = useState(['대구 (중구)']); // 기본값: 대구 중구
  const [shortTermForecastData, setShortTermForecastData] = useState([]); // 단기 예보 데이터

  // 중기 예보를 위한 상태
  const [midForecastStartDate, setMidForecastStartDate] = useState(
    new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().slice(0, 10) // 중기 예보는 오늘 +3일 부터 시작
  );
  const [midForecastEndDate, setMidForecastEndDate] = useState(
    new Date(new Date().setDate(new Date().getDate() + 9)).toISOString().slice(0, 10) // 중기 예보는 오늘 +9일 까지 (총 7일)
  );
  const [selectedMidForecastRegions, setSelectedMidForecastRegions] = useState(['대구 (중구)']); // 기본값: 대구 중구
  const [midTermForecastData, setMidTermForecastData] = useState([]); // 중기 예보 데이터

  // 데이터 로딩 상태
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(false);
  const [isLoadingShortTerm, setIsLoadingShortTerm] = useState(false);
  const [isLoadingMidTerm, setIsLoadingMidTerm] = useState(false);

  // 에러 상태
  const [errorDaily, setErrorDaily] = useState(null);
  const [errorHistorical, setErrorHistorical] = useState(null);
  const [errorShortTerm, setErrorShortTerm] = useState(null);
  const [errorMidTerm, setErrorMidTerm] = useState(null);

  // Firebase 관련 상태 (인증 및 사용자 ID)
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Firebase 초기화 및 인증
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length > 0) {
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);

        const signIn = async () => {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authInstance, initialAuthToken);
            } else {
              await signInAnonymously(authInstance);
            }
            setUserId(authInstance.currentUser?.uid || crypto.randomUUID());
          } catch (e) {
            console.error("Firebase Auth Error:", e);
            setUserId(crypto.randomUUID());
          } finally {
            setIsAuthReady(true);
          }
        };
        signIn();
      } else {
        console.warn("Firebase config not found. Proceeding without Firebase initialization.");
        setUserId(crypto.randomUUID());
        setIsAuthReady(true);
      }
    } catch (e) {
      console.error("Failed to initialize Firebase:", e);
      setUserId(crypto.randomUUID());
      setIsAuthReady(true);
    }
  }, []);

  // --- KMA API 호출 시뮬레이션 함수 ---
  // 실제 API 호출 로직은 KMA API 문서에 따라 `fetch` 요청으로 대체해야 합니다.
  const fetchDailyTemperature = async () => {
    setIsLoadingDaily(true);
    setErrorDaily(null);
    try {
      // 실제 KMA API 엔드포인트와 파라미터는 KMA API 문서를 참고하여 구성하세요.
      // 예: `${KMA_API_BASE_URL}/api/DailyTemperature?date=${selectedDate}&apiKey=${KMA_API_KEY}&area=Daegu`
      await new Promise(resolve => setTimeout(resolve, 1000));

      const dummyData = [
        { location: '대구', lat: 35.8714, lon: 128.6014, temp: 28.5 + Math.random() * 4 - 2 },
        { location: '구미', lat: 36.1283, lon: 128.3377, temp: 27.2 + Math.random() * 4 - 2 },
        { location: '포항', lat: 36.0357, lon: 129.3565, temp: 26.8 + Math.random() * 4 - 2 },
        { location: '경주', lat: 35.8488, lon: 129.2152, temp: 29.1 + Math.random() * 4 - 2 },
        { location: '안동', lat: 36.5684, lon: 128.7297, temp: 27.5 + Math.random() * 4 - 2 },
        { location: '김천', lat: 36.1118, lon: 128.1135, temp: 28.0 + Math.random() * 4 - 2 },
        { location: '영천', lat: 35.9754, lon: 128.9463, temp: 29.5 + Math.random() * 4 - 2 }, // 열섬 효과를 위해 조금 더 높게
        { location: '청도', lat: 35.6322, lon: 128.7303, temp: 26.0 + Math.random() * 4 - 2 }, // 외곽 지역으로 가정
      ];
      setDailyTemperatureData(dummyData);
    } catch (err) {
      console.error("일일 기온 데이터 호출 실패:", err);
      setErrorDaily("일일 기온 데이터를 가져오는데 실패했습니다.");
    } finally {
      setIsLoadingDaily(false);
    }
  };

  const fetchHistoricalTemperature = async () => {
    setIsLoadingHistorical(true);
    setErrorHistorical(null);
    try {
      // 실제 KMA API 엔드포인트와 파라미터는 KMA API 문서를 참고하여 구성하세요.
      await new Promise(resolve => setTimeout(resolve, 1000));

      const dummyHistoricalData = [];
      const baseAvgTemp = {
        'Daegu': 15, 'Gumi': 14.5, 'Pohang': 14, 'Gyeongju': 14.8, 'Andong': 13.5, 'Gimcheon': 14.2
      }[selectedRegion] || 14;

      for (let year = startYear; year <= endYear; year++) {
        dummyHistoricalData.push({
          year: year,
          avgTemp: baseAvgTemp + (year - (new Date().getFullYear() - 2)) * 0.2 + (Math.random() * 1.0 - 0.5),
          maxTemp: baseAvgTemp + 15 + (Math.random() * 5),
          minTemp: baseAvgTemp - 15 - (Math.random() * 5)
        });
      }
      setHistoricalTemperatureData(dummyHistoricalData);
    } catch (err) {
      console.error("과거 기온 데이터 호출 실패:", err);
      setErrorHistorical("과거 기온 데이터를 가져오는데 실패했습니다.");
    } finally {
      setIsLoadingHistorical(false);
    }
  };

  const fetchShortTermForecast = async () => {
    if (selectedForecastRegions.length === 0) {
      setShortTermForecastData([]);
      setErrorShortTerm("예보를 보려면 하나 이상의 지역을 선택해주세요.");
      return;
    }

    // 날짜 범위 유효성 검사
    const start = new Date(forecastStartDate);
    const end = new Date(forecastEndDate);
    if (start > end) {
      setErrorShortTerm("예보 시작 날짜는 예보 끝 날짜보다 늦을 수 없습니다.");
      setShortTermForecastData([]);
      return;
    }
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 2) { // KMA 단기 예보는 보통 최대 3일치 (시작일 포함)
      setErrorShortTerm("단기 예보는 최대 3일(시작일 포함)까지 선택 가능합니다.");
      setShortTermForecastData([]);
      return;
    }

    setIsLoadingShortTerm(true);
    setErrorShortTerm(null);

    const combinedForecastDataMap = new Map(); // Key: `${YYYY-MM-DD HH:MM}`, Value: { dateTime: ..., regionA: tempA, regionB: tempB }

    const fetchPromises = selectedForecastRegions.map(async (regionKey) => {
      const grid = KMA_GRID_POINTS[regionKey];
      if (!grid) {
        console.warn(`선택된 지역 '${regionKey}'의 격자점 정보가 없습니다.`);
        return { regionKey, data: [] };
      }

      const regionHourlyData = [];
      let currentDate = new Date(forecastStartDate);
      const endDateObj = new Date(forecastEndDate);

      while (currentDate <= endDateObj) {
        // For each day in the range, generate 8 data points (00, 03, 06, ..., 21시)
        for (let i = 0; i < 8; i++) { // 00, 03, ..., 21시 (8 points)
            const forecastHour = (i * 3); // 0, 3, 6, ..., 21
            const fcstTimeStr = forecastHour.toString().padStart(2, '0') + '00';
            const fullDateTime = `${currentDate.toISOString().slice(0,10)} ${fcstTimeStr.slice(0,2)}:${fcstTimeStr.slice(2,4)}`;

            let temp;
            const hour = parseInt(fcstTimeStr.slice(0, 2));
            // 시간대에 따른 기온 변화 시뮬레이션
            if (hour >= 21 || hour < 6) { // 밤~새벽
              temp = 18 + Math.random() * 5 - 2;
            } else if (hour >= 6 && hour < 12) { // 아침~낮
              temp = 25 + Math.random() * 5 - 2;
            } else { // 오후
              temp = 28 + Math.random() * 5 - 2;
            }

            // 특정 지역 (대구 내)에 열섬 효과를 반영하여 기온을 약간 높게 설정
            if (regionKey.includes('대구')) {
              temp += (Math.random() * 1.5 + 0.5); // 도심 지역은 +0.5 ~ +2.0도 높게
            } else {
              temp -= (Math.random() * 1.0); // 외곽 지역은 약간 낮게
            }
            // 지역별 약간의 차이 추가 (같은 시간이라도 지역마다 다르게)
            temp += (regionKey.length % 5) * 0.1 - 0.2;

            regionHourlyData.push({
                fcstDate: currentDate.toISOString().slice(0, 10).replace(/-/g, ''), // YYYYMMDD
                fcstTime: fcstTimeStr, // HHMM
                dateTime: fullDateTime, // YYYY-MM-DD HH:MM for graph X-axis and sorting
                fcstValue: parseFloat(temp.toFixed(1)),
            });
        }
        currentDate.setDate(currentDate.getDate() + 1); // 다음 날짜로 이동
      }
      return { regionKey, data: regionHourlyData };
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call delay
      const results = await Promise.all(fetchPromises);

      let hasError = false;
      results.forEach(({ regionKey, data, error }) => {
        if (error) {
          hasError = true;
          setErrorShortTerm(prev => (prev ? `${prev}, ${KMA_GRID_POINTS[regionKey]?.regionName} 오류` : `${KMA_GRID_POINTS[regionKey]?.regionName} 오류: ${error}`));
        } else {
          data.forEach(item => {
            if (!combinedForecastDataMap.has(item.dateTime)) {
              combinedForecastDataMap.set(item.dateTime, {
                dateTime: item.dateTime,
              });
            }
            const currentItem = combinedForecastDataMap.get(item.dateTime);
            currentItem[regionKey] = item.fcstValue; // 지역 이름을 키로 하여 기온 값 저장
          });
        }
      });

      // 시간 순으로 정렬된 배열로 변환
      let sortedCombinedData = Array.from(combinedForecastDataMap.values()).sort((a, b) => {
        return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
      });

      // 각 시간대별 최고/최저 기온 및 지역 계산
      const processedForecastData = sortedCombinedData.map(dataPoint => {
        let minTemp = Infinity;
        let maxTemp = -Infinity;
        let minRegion = '';
        let maxRegion = '';

        selectedForecastRegions.forEach(regionKey => {
          const temp = dataPoint[regionKey];
          if (temp !== undefined) { // 해당 지역의 기온 데이터가 존재하는 경우에만 비교
            if (temp < minTemp) {
              minTemp = temp;
              minRegion = KMA_GRID_POINTS[regionKey].regionName;
            }
            if (temp > maxTemp) {
              maxTemp = temp;
              maxRegion = KMA_GRID_POINTS[regionKey].regionName;
            }
          }
        });

        return {
          ...dataPoint,
          minTempOverall: minTemp === Infinity ? undefined : minTemp,
          minRegionOverall: minRegion,
          maxTempOverall: maxTemp === -Infinity ? undefined : maxTemp,
          maxRegionOverall: maxRegion
        };
      });

      setShortTermForecastData(processedForecastData);
      if (hasError && !errorShortTerm) {
          setErrorShortTerm("일부 지역의 단기 예보 데이터를 가져오는데 실패했습니다.");
      }
    } catch (err) {
      console.error("단기 예보 데이터 호출 실패:", err);
      setErrorShortTerm("단기 예보 데이터를 가져오는데 실패했습니다.");
    } finally {
      setIsLoadingShortTerm(false);
    }
  };

  const fetchMidTermForecast = async () => {
    if (selectedMidForecastRegions.length === 0) {
      setMidTermForecastData([]);
      setErrorMidTerm("예보를 보려면 하나 이상의 지역을 선택해주세요.");
      return;
    }

    // 날짜 범위 유효성 검사
    const start = new Date(midForecastStartDate);
    const end = new Date(midForecastEndDate);
    if (start > end) {
      setErrorMidTerm("예보 시작 날짜는 예보 끝 날짜보다 늦을 수 없습니다.");
      setMidTermForecastData([]);
      return;
    }
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 6) { // 중기 예보는 보통 3일 후부터 10일 후까지 (총 7일 범위)
      setErrorMidTerm("중기 예보는 시작일로부터 3일 후부터 최대 9일 후까지 선택 가능합니다 (총 7일 범위).");
      setMidTermForecastData([]);
      return;
    }

    // 중기 예보 시작 날짜가 오늘로부터 최소 3일 후인지 확인
    const today = new Date();
    today.setHours(0,0,0,0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    if (start < threeDaysLater) {
      setErrorMidTerm("중기 예보 시작 날짜는 오늘로부터 최소 3일 후여야 합니다.");
      setMidTermForecastData([]);
      return;
    }

    setIsLoadingMidTerm(true);
    setErrorMidTerm(null);

    const combinedForecastDataMap = new Map(); // Key: YYYY-MM-DD, Value: { date: YYYY-MM-DD, regionA_min: temp, regionA_max: temp, ... }

    const fetchPromises = selectedMidForecastRegions.map(async (regionKey) => {
      const grid = KMA_GRID_POINTS[regionKey];
      if (!grid) {
        console.warn(`선택된 지역 '${regionKey}'의 격자점 정보가 없습니다.`);
        return { regionKey, data: [] };
      }

      const regionDailyData = [];
      let currentDate = new Date(midForecastStartDate);
      const endDateObj = new Date(midForecastEndDate);

      while (currentDate <= endDateObj) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 작은 지연
        const dateString = currentDate.toISOString().slice(0, 10); // YYYY-MM-DD

        let minTemp = 10 + Math.random() * 8 - 4; // 더미 최저 기온
        let maxTemp = 20 + Math.random() * 8 - 4; // 더미 최고 기온

        // 지역별 열섬 효과 및 특성 반영 (더미 데이터)
        if (regionKey.includes('대구')) {
          minTemp += (Math.random() * 1.0 + 0.5);
          maxTemp += (Math.random() * 1.5 + 0.5);
        } else {
          minTemp -= (Math.random() * 0.5);
          maxTemp -= (Math.random() * 0.5);
        }
        // minTemp가 maxTemp보다 높지 않도록 보정
        if (minTemp > maxTemp) {
            const temp = minTemp;
            minTemp = maxTemp;
            maxTemp = temp;
        }


        regionDailyData.push({
            date: dateString,
            taMin: parseFloat(minTemp.toFixed(1)),
            taMax: parseFloat(maxTemp.toFixed(1)),
        });

        currentDate.setDate(currentDate.getDate() + 1); // 다음 날짜로 이동
      }
      return { regionKey, data: regionDailyData };
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call delay
      const results = await Promise.all(fetchPromises);

      let hasError = false;
      results.forEach(({ regionKey, data, error }) => {
        if (error) {
          hasError = true;
          setErrorMidTerm(prev => (prev ? `${prev}, ${KMA_GRID_POINTS[regionKey]?.regionName} 오류` : `${KMA_GRID_POINTS[regionKey]?.regionName} 오류: ${error}`));
        } else {
          data.forEach(item => {
            if (!combinedForecastDataMap.has(item.date)) {
              combinedForecastDataMap.set(item.date, { date: item.date });
            }
            const currentItem = combinedForecastDataMap.get(item.date);
            currentItem[`${regionKey}_min`] = item.taMin; // 지역_min 키로 최저 기온 저장
            currentItem[`${regionKey}_max`] = item.taMax; // 지역_max 키로 최고 기온 저장
          });
        }
      });

      let sortedCombinedData = Array.from(combinedForecastDataMap.values()).sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      // 각 시간대별(일별) 최고/최저 기온 및 지역 계산
      const processedForecastData = sortedCombinedData.map(dataPoint => {
        let minTemp = Infinity;
        let maxTemp = -Infinity;
        let minRegion = '';
        let maxRegion = '';

        selectedMidForecastRegions.forEach(regionKey => {
          const tempMin = dataPoint[`${regionKey}_min`];
          const tempMax = dataPoint[`${regionKey}_max`];

          if (tempMin !== undefined) {
            if (tempMin < minTemp) {
              minTemp = tempMin;
              minRegion = KMA_GRID_POINTS[regionKey].regionName;
            }
          }
          if (tempMax !== undefined) {
            if (tempMax > maxTemp) {
              maxTemp = tempMax;
              maxRegion = KMA_GRID_POINTS[regionKey].regionName;
            }
          }
        });

        return {
          ...dataPoint,
          minTempOverall: minTemp === Infinity ? undefined : minTemp,
          minRegionOverall: minRegion,
          maxTempOverall: maxTemp === -Infinity ? undefined : maxTemp,
          maxRegionOverall: maxRegion
        };
      });

      setMidTermForecastData(processedForecastData);
      if (hasError && !errorMidTerm) {
          setErrorMidTerm("일부 지역의 중기 예보 데이터를 가져오는데 실패했습니다.");
      }
    } catch (err) {
      console.error("중기 예보 데이터 호출 실패:", err);
      setErrorMidTerm("중기 예보 데이터를 가져오는데 실패했습니다.");
    } finally {
      setIsLoadingMidTerm(false);
    }
  };


  // 날짜 변경 시 일일 기온 데이터 호출
  useEffect(() => {
    fetchDailyTemperature();
  }, [selectedDate]);

  // 지역, 연도 범위 변경 시 과거 기온 데이터 호출
  useEffect(() => {
    fetchHistoricalTemperature();
  }, [selectedRegion, startYear, endYear]);

  // 단기 예보 관련 상태 변경 시 데이터 호출
  useEffect(() => {
    fetchShortTermForecast();
  }, [forecastStartDate, forecastEndDate, baseTime, selectedForecastRegions]);

  // 중기 예보 관련 상태 변경 시 데이터 호출
  useEffect(() => {
    fetchMidTermForecast();
  }, [midForecastStartDate, midForecastEndDate, selectedMidForecastRegions]);


  // 현재 년도를 기준으로 연도 옵션 생성
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 9 + i); // 지난 10년

  // 예보 기준 시간 옵션
  const baseTimeOptions = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];

  // 체크박스 핸들러
  const handleForecastRegionChange = (e) => {
    const { value, checked } = e.target;
    setSelectedForecastRegions(prev =>
      checked ? [...prev, value] : prev.filter(region => region !== value)
    );
  };

  const handleMidForecastRegionChange = (e) => {
    const { value, checked } = e.target;
    setSelectedMidForecastRegions(prev =>
      checked ? [...prev, value] : prev.filter(region => region !== value)
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 p-4 font-sans text-gray-800 rounded-lg shadow-lg antialiased">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl p-8 space-y-8">
        <h1 className="text-4xl font-extrabold text-center text-indigo-700 mb-8 pb-4 border-b-4 border-indigo-300 transform transition-transform duration-300 hover:scale-105">
          <span className="inline-block transform -rotate-3 mr-2 text-blue-500">☀️</span> 대한민국 기온 분석: 대구/경북
        </h1>

        <p className="text-center text-lg text-gray-600 mb-6 leading-relaxed">
          이 페이지는 대구광역시 및 주변 지역의 기온 변화와 분포를 시각화합니다.
          <br />KMA API 키가 미리 설정되어 있습니다.
        </p>

        {/* 날짜별 위치 기온 분포 섹션 (지도) */}
        <section className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
          <h2 className="text-3xl font-bold text-indigo-600 mb-6 border-b-2 pb-2 border-indigo-200">
            날짜별 위치 기온 분포 (대구/경북)
          </h2>
          <p className="text-gray-600 mb-4">
            선택된 날짜의 대구 및 주변 지역의 일일 기온을 확인해보세요.
            <br />
            <strong className="text-red-500">주의: 실제 지도 API 연동은 추가 개발이 필요하며, 현재는 시각적 예시를 제공합니다.</strong>
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
            <label htmlFor="mapDate" className="font-medium text-gray-700 whitespace-nowrap">날짜 선택:</label>
            <input
              type="date"
              id="mapDate"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 flex-grow"
              max={new Date().toISOString().slice(0, 10)} // 오늘 날짜까지만 선택 가능
            />
          </div>

          {isLoadingDaily && <div className="text-center text-indigo-500 text-lg py-8">지도 데이터 로딩 중...</div>}
          {errorDaily && <div className="text-center text-red-500 text-lg py-8">오류: {errorDaily}</div>}

          {!isLoadingDaily && !errorDaily && dailyTemperatureData.length > 0 && (
            <div className="relative w-full h-96 bg-gray-100 rounded-lg overflow-hidden border border-gray-300 flex items-center justify-center">
              {/* 실제 지도 대신 시각적 이해를 돕기 위한 이미지 사용 */}
              <img
                src="https://placehold.co/1200x600/e0f2f7/42a5f5?text=Map+of+Daegu+%26+Gyeongbuk"
                alt="대구/경북 지도 예시 이미지"
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/1200x600/e0e0e0/555555?text=Map+Image+Unavailable"; }}
              />
              <div className="absolute inset-0 bg-black bg-opacity-40 flex flex-col items-center justify-center text-white text-shadow-lg p-4">
                <p className="text-2xl font-bold mb-3">선택 날짜: {selectedDate}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-base">
                  {dailyTemperatureData.map((data, index) => (
                    <div
                      key={index}
                      className={`bg-indigo-700 bg-opacity-90 p-3 rounded-md text-center shadow-lg transform transition-transform duration-200 hover:scale-105
                        ${data.location === '대구' ? 'border-2 border-yellow-300' : ''}
                      `}
                    >
                      <p className="font-semibold text-lg">{data.location}</p>
                      <p className="text-xl font-bold">{data.temp.toFixed(1)}°C</p>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-sm italic opacity-90 text-center">
                  (이 표시는 KMA API에서 가져온 데이터를 기반으로 한 개념적 시각화입니다. <br/> 실제 기상 데이터는 KMA API를 통해 연동해야 합니다.)
                </p>
              </div>
            </div>
          )}
        </section>

        {/* --- */}

        {/* 단기 예보 섹션 */}
        <section className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
          <h2 className="text-3xl font-bold text-indigo-600 mb-6 border-b-2 pb-2 border-indigo-200">
            단기 예보: 지역별 시간대별 기온
          </h2>
          <p className="text-gray-600 mb-4">
            선택한 지역의 단기 예보 기온을 그래프와 표로 확인해보세요.
            <br />
            <strong className="text-red-500">주의: 실제 데이터는 KMA API 키를 통해 연동해야 하며, 현재는 더미 데이터입니다.</strong>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label htmlFor="forecastStartDate" className="block font-medium text-gray-700 mb-2">예보 시작 날짜:</label>
              <input
                type="date"
                id="forecastStartDate"
                value={forecastStartDate}
                onChange={(e) => {
                  setForecastStartDate(e.target.value);
                  // 시작 날짜 변경 시, 끝 날짜도 최소한 시작 날짜와 같게 설정
                  const newStartDate = new Date(e.target.value);
                  const currentEndDate = new Date(forecastEndDate);
                  if (newStartDate > currentEndDate) {
                    setForecastEndDate(e.target.value);
                  }
                }}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                max={new Date().toISOString().slice(0, 10)} // 오늘 날짜까지만 시작 가능
              />
            </div>
            <div>
              <label htmlFor="forecastEndDate" className="block font-medium text-gray-700 mb-2">예보 끝 날짜:</label>
              <input
                type="date"
                id="forecastEndDate"
                value={forecastEndDate}
                onChange={(e) => setForecastEndDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                min={forecastStartDate} // 시작 날짜보다 이전일 수 없음
                max={new Date(new Date(forecastStartDate).setDate(new Date(forecastStartDate).getDate() + 2)).toISOString().slice(0, 10)} // 시작 날짜로부터 최대 2일 후 (총 3일)
              />
            </div>
            <div>
              <label htmlFor="baseTime" className="block font-medium text-gray-700 mb-2">예보 기준 시간:</label>
              <select
                id="baseTime"
                value={baseTime}
                onChange={(e) => setBaseTime(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              >
                {baseTimeOptions.map(time => (
                  <option key={time} value={time}>
                    {time.slice(0, 2)}:{time.slice(2, 4)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-1 md:col-span-3"> {/* 체크박스 그룹 전체 너비 차지 */}
              <label className="block font-medium text-gray-700 mb-2">지역 선택 (복수 선택 가능):</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 bg-gray-50 p-3 rounded-md border border-gray-200">
                {Object.keys(KMA_GRID_POINTS).map(key => (
                  <label key={key} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:text-indigo-600">
                    <input
                      type="checkbox"
                      value={key}
                      checked={selectedForecastRegions.includes(key)}
                      onChange={handleForecastRegionChange}
                      className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out rounded focus:ring-indigo-500"
                    />
                    <span>{KMA_GRID_POINTS[key].regionName}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {isLoadingShortTerm && <div className="text-center text-indigo-500 text-lg py-8">단기 예보 데이터 로딩 중...</div>}
          {errorShortTerm && <div className="text-center text-red-500 text-lg py-8">오류: {errorShortTerm}</div>}

          {!isLoadingShortTerm && !errorShortTerm && selectedForecastRegions.length > 0 && shortTermForecastData.length > 0 ? (
            <>
              {/* 단기 예보 그래프 */}
              <div className="w-full h-96 bg-gray-50 rounded-lg p-4 shadow-inner border border-gray-300 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={shortTermForecastData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="dateTime" // 'YYYY-MM-DD HH:MM' 형식
                      label={{ value: '예보 일시', position: 'insideBottomRight', offset: 0, fill: '#4a5568' }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}시`;
                      }}
                      angle={-20} // 라벨 겹침 방지를 위해 각도 조절
                      textAnchor="end"
                      height={50} // 텍스트를 위한 공간 확보
                      interval="preserveStartEnd" // 시작과 끝 라벨 유지
                    />
                    <YAxis
                      label={{ value: '기온 (°C)', angle: -90, position: 'insideLeft', fill: '#4a5568' }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(value, name) => [`${value.toFixed(1)}°C`, KMA_GRID_POINTS[name]?.regionName || name]}
                      labelFormatter={(label) => {
                        const date = new Date(label);
                        return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours()}시`;
                      }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                      itemStyle={{ padding: '4px 0' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    {selectedForecastRegions.map((regionKey, index) => (
                      <Line
                        key={regionKey}
                        type="monotone"
                        dataKey={regionKey} // 지역 이름을 dataKey로 사용
                        stroke={LINE_COLORS[index % LINE_COLORS.length]} // 순환 색상
                        name={KMA_GRID_POINTS[regionKey].regionName} // 범례에 표시될 이름
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 시간대별 최고/최저 기온 요약 */}
              <h3 className="text-xl font-bold text-gray-700 mt-8 mb-4 border-b pb-2 border-gray-200">
                시간대별 최고/최저 기온 요약
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-md">
                  <thead className="bg-indigo-50">
                    <tr>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        일시
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        최고 기온
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        최고 지역
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        최저 기온
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        최저 지역
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shortTermForecastData.map((data, index) => (
                      <tr key={index} className="hover:bg-gray-50 text-sm">
                        <td className="py-2 px-3 whitespace-nowrap">
                          {new Date(data.dateTime).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                          {" "}
                          {new Date(data.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-red-600 font-bold">
                          {data.maxTempOverall !== undefined ? `${data.maxTempOverall.toFixed(1)}°C` : '-'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {data.maxRegionOverall || '-'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-blue-600 font-bold">
                          {data.minTempOverall !== undefined ? `${data.minTempOverall.toFixed(1)}°C` : '-'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {data.minRegionOverall || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 시간대별 기온 표 (기존 표, 이제는 위 표와 기능적으로 중복될 수 있음) */}
              <h3 className="text-xl font-bold text-gray-700 mt-8 mb-4 border-b pb-2 border-gray-200">
                선택 지역별 상세 예보 데이터
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-md">
                  <thead className="bg-indigo-100">
                    <tr>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider border-b">
                        예보 일자
                      </th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider border-b">
                        예보 시간
                      </th>
                      {selectedForecastRegions.map(regionKey => (
                        <th key={regionKey} className="py-3 px-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider border-b">
                          {KMA_GRID_POINTS[regionKey].regionName} 기온 (°C)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {shortTermForecastData.map((data, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="py-3 px-4 whitespace-nowrap">
                          {new Date(data.dateTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {new Date(data.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </td>
                        {selectedForecastRegions.map(regionKey => (
                            <td key={regionKey} className="py-3 px-4 whitespace-nowrap font-medium text-lg text-indigo-700">
                                {data[regionKey] ? `${data[regionKey].toFixed(1)}°C` : '-'}
                            </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            selectedForecastRegions.length === 0 && !isLoadingShortTerm && !errorShortTerm ? (
              <div className="text-center text-gray-500 text-lg py-8">단기 예보를 보려면 최소 한 개 이상의 지역을 선택해주세요.</div>
            ) : null
          )}
        </section>

        {/* --- */}

        {/* 중기 예보 섹션 */}
        <section className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
          <h2 className="text-3xl font-bold text-indigo-600 mb-6 border-b-2 pb-2 border-indigo-200">
            중기 예보: 지역별 일별 기온 (최저/최고)
          </h2>
          <p className="text-gray-600 mb-4">
            선택한 지역의 중기 예보(오늘부터 3일~9일 후) 기온을 그래프와 표로 확인해보세요.
            <br />
            <strong className="text-red-500">주의: 실제 데이터는 KMA API 키를 통해 연동해야 하며, 현재는 더미 데이터입니다.</strong>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label htmlFor="midForecastStartDate" className="block font-medium text-gray-700 mb-2">예보 시작 날짜:</label>
              <input
                type="date"
                id="midForecastStartDate"
                value={midForecastStartDate}
                onChange={(e) => {
                  setMidForecastStartDate(e.target.value);
                  const newStartDate = new Date(e.target.value);
                  const currentEndDate = new Date(midForecastEndDate);
                  if (newStartDate > currentEndDate) {
                    setMidForecastEndDate(e.target.value);
                  }
                }}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                min={new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().slice(0, 10)} // 오늘로부터 최소 3일 후
                max={new Date(new Date().setDate(new Date().getDate() + 9)).toISOString().slice(0, 10)} // 오늘로부터 최대 9일 후
              />
            </div>
            <div>
              <label htmlFor="midForecastEndDate" className="block font-medium text-gray-700 mb-2">예보 끝 날짜:</label>
              <input
                type="date"
                id="midForecastEndDate"
                value={midForecastEndDate}
                onChange={(e) => setMidForecastEndDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                min={midForecastStartDate} // 시작 날짜보다 이전일 수 없음
                max={new Date(new Date(midForecastStartDate).setDate(new Date(midForecastStartDate).getDate() + 6)).toISOString().slice(0, 10)} // 시작 날짜로부터 최대 6일 후 (총 7일 범위)
              />
            </div>
            <div className="col-span-1 md:col-span-3"> {/* 체크박스 그룹 전체 너비 차지 */}
              <label className="block font-medium text-gray-700 mb-2">지역 선택 (복수 선택 가능):</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 bg-gray-50 p-3 rounded-md border border-gray-200">
                {Object.keys(KMA_GRID_POINTS).map(key => (
                  <label key={key} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:text-indigo-600">
                    <input
                      type="checkbox"
                      value={key}
                      checked={selectedMidForecastRegions.includes(key)}
                      onChange={handleMidForecastRegionChange}
                      className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out rounded focus:ring-indigo-500"
                    />
                    <span>{KMA_GRID_POINTS[key].regionName}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {isLoadingMidTerm && <div className="text-center text-indigo-500 text-lg py-8">중기 예보 데이터 로딩 중...</div>}
          {errorMidTerm && <div className="text-center text-red-500 text-lg py-8">오류: {errorMidTerm}</div>}

          {!isLoadingMidTerm && !errorMidTerm && selectedMidForecastRegions.length > 0 && midTermForecastData.length > 0 ? (
            <>
              {/* 중기 예보 그래프 */}
              <div className="w-full h-96 bg-gray-50 rounded-lg p-4 shadow-inner border border-gray-300 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={midTermForecastData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="date" // YYYY-MM-DD 형식
                      label={{ value: '예보 일자', position: 'insideBottomRight', offset: 0, fill: '#4a5568' }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      label={{ value: '기온 (°C)', angle: -90, position: 'insideLeft', fill: '#4a5568' }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(value, name) => {
                        const [regionKey, tempType] = name.split('_');
                        const regionName = KMA_GRID_POINTS[regionKey]?.regionName || regionKey;
                        const typeLabel = tempType === 'min' ? '최저' : '최고';
                        return [`${value.toFixed(1)}°C`, `${regionName} ${typeLabel}`];
                      }}
                      labelFormatter={(label) => {
                        const date = new Date(label);
                        return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
                      }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                      itemStyle={{ padding: '4px 0' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    {selectedMidForecastRegions.map((regionKey, index) => (
                      <React.Fragment key={regionKey}>
                        <Line
                          type="monotone"
                          dataKey={`${regionKey}_min`} // 지역이름_min
                          stroke={LINE_COLORS[index % LINE_COLORS.length]}
                          name={`${KMA_GRID_POINTS[regionKey].regionName}_최저`}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 6, strokeWidth: 2 }}
                          strokeDasharray="5 5" // 최저 기온은 점선으로
                        />
                        <Line
                          type="monotone"
                          dataKey={`${regionKey}_max`} // 지역이름_max
                          stroke={LINE_COLORS[index % LINE_COLORS.length]}
                          name={`${KMA_GRID_POINTS[regionKey].regionName}_최고`}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 6, strokeWidth: 2 }}
                        />
                      </React.Fragment>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 일별 최고/최저 기온 요약 (중기 예보용) */}
              <h3 className="text-xl font-bold text-gray-700 mt-8 mb-4 border-b pb-2 border-gray-200">
                일별 최고/최저 기온 요약 (중기 예보)
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-md">
                  <thead className="bg-indigo-50">
                    <tr>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        일자
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        전체 최고 기온
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        최고 지역
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        전체 최저 기온
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                        최저 지역
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {midTermForecastData.map((data, index) => (
                      <tr key={index} className="hover:bg-gray-50 text-sm">
                        <td className="py-2 px-3 whitespace-nowrap">
                          {new Date(data.date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-red-600 font-bold">
                          {data.maxTempOverall !== undefined ? `${data.maxTempOverall.toFixed(1)}°C` : '-'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {data.maxRegionOverall || '-'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-blue-600 font-bold">
                          {data.minTempOverall !== undefined ? `${data.minTempOverall.toFixed(1)}°C` : '-'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {data.minRegionOverall || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 중기 예보 상세 표 */}
              <h3 className="text-xl font-bold text-gray-700 mt-8 mb-4 border-b pb-2 border-gray-200">
                선택 지역별 상세 예보 데이터 (중기 예보)
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-md">
                  <thead className="bg-indigo-100">
                    <tr>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider border-b">
                        예보 일자
                      </th>
                      {selectedMidForecastRegions.map(regionKey => (
                        <React.Fragment key={regionKey}>
                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider border-b">
                                {KMA_GRID_POINTS[regionKey].regionName} (최저)
                            </th>
                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider border-b">
                                {KMA_GRID_POINTS[regionKey].regionName} (최고)
                            </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {midTermForecastData.map((data, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="py-3 px-4 whitespace-nowrap">
                          {new Date(data.date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </td>
                        {selectedMidForecastRegions.map(regionKey => (
                            <React.Fragment key={regionKey}>
                                <td className="py-3 px-4 whitespace-nowrap font-medium text-blue-700">
                                    {data[`${regionKey}_min`] ? `${data[`${regionKey}_min`].toFixed(1)}°C` : '-'}
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap font-medium text-red-700">
                                    {data[`${regionKey}_max`] ? `${data[`${regionKey}_max`].toFixed(1)}°C` : '-'}
                                </td>
                            </React.Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            selectedMidForecastRegions.length === 0 && !isLoadingMidTerm && !errorMidTerm ? (
              <div className="text-center text-gray-500 text-lg py-8">중기 예보를 보려면 최소 한 개 이상의 지역을 선택해주세요.</div>
            ) : null
          )}
        </section>

        {/* --- */}

        {/* 지역별 기간 기온 분석 그래프 섹션 */}
        <section className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
          <h2 className="text-3xl font-bold text-indigo-600 mb-6 border-b-2 pb-2 border-indigo-200">
            지역별 기간 기온 분석 그래프 (연도별)
          </h2>
          <p className="text-gray-600 mb-4">
            선택한 지역의 1년에서 5년 간의 평균, 최고, 최저 기온 변화 추이를 그래프로 확인해보세요.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label htmlFor="regionSelect" className="block font-medium text-gray-700 mb-2">지역 선택:</label>
              <select
                id="regionSelect"
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              >
                {/* 과거 데이터용 지역 선택은 기존대로 유지 */}
                <option value="Daegu">대구</option>
                <option value="Gumi">구미</option>
                <option value="Pohang">포항</option>
                <option value="Gyeongju">경주</option>
                <option value="Andong">안동</option>
                <option value="Gimcheon">김천</option>
              </select>
            </div>
            <div>
              <label htmlFor="startYear" className="block font-medium text-gray-700 mb-2">시작 연도:</label>
              <select
                id="startYear"
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              >
                {yearOptions.map(year => (
                  <option key={year} value={year} disabled={year > endYear}>
                    {year}년
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="endYear" className="block font-medium text-gray-700 mb-2">끝 연도:</label>
              <select
                id="endYear"
                value={endYear}
                onChange={(e) => setEndYear(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              >
                {yearOptions.map(year => (
                  <option key={year} value={year} disabled={year < startYear}>
                    {year}년
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoadingHistorical && <div className="text-center text-indigo-500 text-lg py-8">과거 기온 데이터 로딩 중...</div>}
          {errorHistorical && <div className="text-center text-red-500 text-lg py-8">오류: {errorHistorical}</div>}

          {!isLoadingHistorical && !errorHistorical && historicalTemperatureData.length > 0 && (
            <div className="w-full h-96 bg-gray-50 rounded-lg p-4 shadow-inner border border-gray-300">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={historicalTemperatureData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="year"
                    label={{ value: '연도', position: 'insideBottomRight', offset: 0, fill: '#4a5568' }}
                    tickFormatter={(value) => `${value}년`}
                    padding={{ left: 30, right: 30 }}
                  />
                  <YAxis
                    label={{ value: '기온 (°C)', angle: -90, position: 'insideLeft', fill: '#4a5568' }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(value) => `${value.toFixed(1)}°C`}
                    labelFormatter={(label) => `${label}년`}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line
                    type="monotone"
                    dataKey="avgTemp"
                    stroke="#8884d8" // 보라색
                    name="평균 기온"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 8, strokeWidth: 2, fill: '#8884d8', stroke: '#8884d8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="maxTemp"
                    stroke="#ff7300" // 주황색
                    name="최고 기온"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 8, strokeWidth: 2, fill: '#ff7300', stroke: '#ff7300' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="minTemp"
                    stroke="#82ca9d" // 녹색
                    name="최저 기온"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 8, strokeWidth: 2, fill: '#82ca9d', stroke: '#82ca9d' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* 사용자 ID 표시 */}
        {isAuthReady && userId && (
            <p className="text-center text-xs text-gray-400 mt-4">
              사용자 ID: {userId}
            </p>
        )}

        <p className="text-center text-sm text-gray-500 mt-8 pt-4 border-t border-gray-200">
          본 애플리케이션은 데모 목적으로 KMA API의 더미 데이터를 사용하며, 실제 데이터는 KMA API 키를 통해 가져와야 합니다.
          <br />지도 연동 및 추가 기능은 직접 구현하시거나 웹 개발 전문가의 도움을 받으셔야 합니다.
        </p>
      </div>
    </div>
  );
}

export default App;
