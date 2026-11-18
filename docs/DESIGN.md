# Interface design

Burnt orange and warm cream. Primary `#ad4d28`, canvas `#fcf8f2`. Orange replaces the earlier green brand palette. The controls use a custom Material UI theme, locally bundled Inter, visible keyboard focus, and responsive layouts.

## Verification

Production frontend build passed. Desktop and mobile layouts were checked against local APIs, including form and navigation behavior. Primary-button text contrast exceeds 4.5:1, and production frontend dependency audit reports zero vulnerabilities.

[Desktop preview](design-desktop.jpg) · [Mobile preview](design-mobile.jpg)

The ledger tests pass, and the updated web assets were synced into the existing Android and iOS projects using Capacitor. Signed native releases were not built.
