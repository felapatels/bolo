import { fireEvent, render } from '@testing-library/react-native';
import {
  MARKETING_CONSENT_TEXT,
  hasMarketingConsent,
  marketingEmailsRecord,
  shouldApplyParkedChoice,
  takeParkedMarketingChoice,
} from '@/lib/marketingConsent';
import { MarketingConsentCheckbox } from '@/components/MarketingConsent';

jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: null, isLoaded: true }) }));

describe('marketing email consent on the phone', () => {
  afterEach(() => {
    takeParkedMarketingChoice();
  });

  it('starts unticked and parks nothing until the learner acts', () => {
    const { getByTestId } = render(<MarketingConsentCheckbox />);
    expect(getByTestId('marketing-consent').props.accessibilityState).toEqual({ checked: false });
    expect(takeParkedMarketingChoice()).toBeNull();
  });

  it('a tick parks a yes with the exact wording, and a second tap parks a no', () => {
    const { getByTestId } = render(<MarketingConsentCheckbox />);
    fireEvent.press(getByTestId('marketing-consent'));
    const yes = takeParkedMarketingChoice();
    expect(yes).toMatchObject({ optedIn: true, source: 'mobile-signup', text: MARKETING_CONSENT_TEXT });
    fireEvent.press(getByTestId('marketing-consent'));
    expect(takeParkedMarketingChoice()).toMatchObject({ optedIn: false });
  });

  it('counts only an explicit recorded yes', () => {
    expect(hasMarketingConsent({ marketingEmails: marketingEmailsRecord(true, 'mobile-account') })).toBe(true);
    expect(hasMarketingConsent({ marketingEmails: marketingEmailsRecord(false, 'mobile-signup') })).toBe(false);
    expect(hasMarketingConsent(undefined)).toBe(false);
  });

  it('writes a parked choice only onto a brand-new account', () => {
    const now = new Date('2026-09-19T15:05:00Z');
    const yes = marketingEmailsRecord(true, 'mobile-signup', new Date('2026-09-19T15:01:00Z'));
    expect(shouldApplyParkedChoice(yes, null, new Date('2026-09-19T15:00:00Z'), now)).toBe(true);
    expect(shouldApplyParkedChoice(yes, null, new Date('2026-01-01T00:00:00Z'), now)).toBe(false);
    expect(shouldApplyParkedChoice(null, null, new Date('2026-09-19T15:00:00Z'), now)).toBe(false);
  });
});
