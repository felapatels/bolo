// The Profile tab re-uses the full Account screen.
// Sub-screens (email, password, subscription, etc.) remain in (app)/account/
// and are pushed as stack sheets above the tabs, so back navigation works
// without leaving the tab context.
export { default } from '../account/index';
