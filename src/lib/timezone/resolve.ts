const KNOWN_TIMEZONE_MAP: Record<string, { timezone: string; confidence: 'high' | 'medium' | 'low' }> = {
  'pakistan': { timezone: 'Asia/Karachi', confidence: 'high' },
  'karachi': { timezone: 'Asia/Karachi', confidence: 'high' },
  'lahore': { timezone: 'Asia/Karachi', confidence: 'high' },
  'islamabad': { timezone: 'Asia/Karachi', confidence: 'high' },

  'united states': { timezone: 'America/New_York', confidence: 'medium' },
  'usa': { timezone: 'America/New_York', confidence: 'medium' },
  'new york': { timezone: 'America/New_York', confidence: 'high' },
  'san francisco': { timezone: 'America/Los_Angeles', confidence: 'high' },
  'los angeles': { timezone: 'America/Los_Angeles', confidence: 'high' },
  'chicago': { timezone: 'America/Chicago', confidence: 'high' },
  'boston': { timezone: 'America/New_York', confidence: 'high' },
  'seattle': { timezone: 'America/Los_Angeles', confidence: 'high' },
  'austin': { timezone: 'America/Chicago', confidence: 'medium' },
  'miami': { timezone: 'America/New_York', confidence: 'medium' },
  'denver': { timezone: 'America/Denver', confidence: 'medium' },
}

const COUNTRY_TIMEZONES: Record<string, string[]> = {
  'PK': ['Asia/Karachi'],
  'US': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
  'GB': ['Europe/London'],
  'AE': ['Asia/Dubai'],
  'IN': ['Asia/Kolkata'],
  'CA': ['America/Toronto', 'America/Vancouver', 'America/Edmonton'],
  'AU': ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth'],
  'DE': ['Europe/Berlin'],
  'FR': ['Europe/Paris'],
  'CN': ['Asia/Shanghai', 'Asia/Urumqi'],
}

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Karachi': 5,
  'America/New_York': -5,
  'America/Chicago': -6,
  'America/Denver': -7,
  'America/Los_Angeles': -8,
  'America/Toronto': -5,
  'America/Vancouver': -8,
  'Europe/London': 0,
  'Europe/Berlin': 1,
  'Europe/Paris': 1,
  'Asia/Dubai': 4,
  'Asia/Kolkata': 5.5,
  'Asia/Shanghai': 8,
  'Australia/Sydney': 10,
  'Australia/Melbourne': 10,
  'Australia/Perth': 8,
}

export interface TimezoneResolution {
  timezone: string | null
  source: 'explicit' | 'location' | 'company' | 'inferred' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  offsetHours: number | null
  localTime: string | null
}

export function resolveTimezoneFromLocation(
  location: string | null | undefined,
  company: string | null | undefined = null,
): TimezoneResolution {
  if (!location && !company) {
    return { timezone: null, source: 'unknown', confidence: 'low', offsetHours: null, localTime: null }
  }

  const searchTerms: string[] = []
  if (location) searchTerms.push(location.toLowerCase())
  if (company) searchTerms.push(company.toLowerCase())

  for (const term of searchTerms) {
    for (const [key, value] of Object.entries(KNOWN_TIMEZONE_MAP)) {
      if (term.includes(key)) {
        return {
          timezone: value.timezone,
          source: 'location',
          confidence: value.confidence,
          offsetHours: TIMEZONE_OFFSETS[value.timezone] ?? null,
          localTime: getTimeInTimezone(value.timezone),
        }
      }
    }
  }

  if (company) {
    for (const [countryCode, timezones] of Object.entries(COUNTRY_TIMEZONES)) {
      if (company.toLowerCase().includes(countryCode.toLowerCase())) {
        return {
          timezone: timezones[0],
          source: 'company',
          confidence: 'medium',
          offsetHours: TIMEZONE_OFFSETS[timezones[0]] ?? null,
          localTime: getTimeInTimezone(timezones[0]),
        }
      }
    }
  }

  return { timezone: null, source: 'unknown', confidence: 'low', offsetHours: null, localTime: null }
}

export function getTimeInTimezone(timezone: string): string | null {
  try {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return null
  }
}

export function getOffsetHours(timezone: string): number | null {
  return TIMEZONE_OFFSETS[timezone] ?? null
}

export function calculateContactWindow(
  prospectTimezone: string,
  repTimezone: string = 'Asia/Karachi',
): { startHour: number; endHour: number; prospectStart: string; prospectEnd: string } {
  const prospectOffset = TIMEZONE_OFFSETS[prospectTimezone] ?? 0
  const repOffset = TIMEZONE_OFFSETS[repTimezone] ?? 0

  const diff = prospectOffset - repOffset

  const repStartHour = 9
  const repEndHour = 17

  const prospectStartHour = ((repStartHour + diff) % 24 + 24) % 24
  const prospectEndHour = ((repEndHour + diff) % 24 + 24) % 24

  return {
    startHour: prospectStartHour,
    endHour: prospectEndHour,
    prospectStart: `${prospectStartHour}:00`,
    prospectEnd: `${prospectEndHour}:00`,
  }
}
