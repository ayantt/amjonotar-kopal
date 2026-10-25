import type { GameState } from "../game/types";

type EventLogProps = {
  events: GameState["events"];
  popupsEnabled: boolean;
  onTogglePopups: () => void;
};

export function EventLog({ events, popupsEnabled, onTogglePopups }: EventLogProps) {
  return <section className="panel log-panel">
    <div className="panel-label">
      <span className="record-title">THE OFFICIAL RECORD <small>RECENT EVENTS</small></span>
      <button className={`event-popup-toggle ${popupsEnabled ? "is-on" : ""}`} type="button" aria-pressed={popupsEnabled} onClick={onTogglePopups}>POPUPS {popupsEnabled ? "ON" : "OFF"}</button>
    </div>
    <div className="event-list">{[...events].reverse().map((event) => <div className={`event event-${event.kind}`} key={event.id}><span>{String(event.id).padStart(3, "0")}</span><p>{event.message}</p></div>)}</div>
  </section>;
}
