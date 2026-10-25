# Track Session Minder

A track day (HPDE) schedule app for iPhone and Android. Drivers see which run
group is on track now, who is up next, and the full day's schedule. An admin
can shift the schedule when the day runs late.

Built with [Expo](https://expo.dev) (React Native) and Expo Router.

## What's here

- `src/app/` – the three screens: **Now**, **Schedule** and **Admin**
- `src/data/sampleEvents.ts` – the Roebling and Barber schedules, copied from the Just Track It PDFs
- `src/lib/schedule.ts` – time math: what's on track now, what's next, shifting the day when running late
- `src/lib/ScheduleStore.tsx` – holds the events; this is where the online database will plug in

Admin changes currently stay on the device that made them. Connecting an
online database (planned: Supabase) will send them to every driver's phone.

## Running it

```bash
npm install
npx expo start        # then scan the QR code with the Expo Go app on your phone
npm run typecheck
node scripts/build-preview.mjs dist/preview.html   # one-file web preview
```
