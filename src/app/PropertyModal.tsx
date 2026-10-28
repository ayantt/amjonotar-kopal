import { BOARD } from "../game/board";
import { useDialogFocus } from "./useDialogFocus";
import { getBuildingCost, getMortgageTerms } from "../game/engine";
import { getBaseRent } from "../game/properties";
import type { GameState } from "../game/types";

type BoardSpace = typeof BOARD[number];
type Player = GameState["players"][number];

type PropertyModalProps = {
  game: GameState;
  current: Player;
  selectedSpace: BoardSpace;
  isCurrentPlayerTurn: boolean;
  citizenCanBuildSelected: boolean;
  onClose: () => void;
  onBuild: (spaceId: string, building: "house" | "hotel") => void;
  onMortgage: (spaceId: string) => void;
  onRedeem: (spaceId: string) => void;
  onSell: (spaceId: string) => void;
};

const money = (amount: number) => `৳${amount.toLocaleString("en-BD")}`;
const roleName = (role: Player["role"]) => role === "politician" ? "Politician" : "Citizen";

export function PropertyModal({
  game,
  current,
  selectedSpace,
  isCurrentPlayerTurn,
  citizenCanBuildSelected,
  onClose,
  onBuild,
  onMortgage,
  onRedeem,
  onSell,
}: PropertyModalProps) {
  const dialogRef = useDialogFocus<HTMLElement>();
  const selectedProperty = game.properties[selectedSpace.id];
  const selectedOwner = selectedProperty?.ownerId ? game.players.find((player) => player.id === selectedProperty.ownerId) : undefined;
  const selectedLeaseholder = selectedProperty?.leaseholderId ? game.players.find((player) => player.id === selectedProperty.leaseholderId) : undefined;

  return <div className="property-modal-backdrop" role="presentation" onClick={() => onClose()}>
      <section className="property-modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="property-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className={`property-modal-header ${selectedSpace.color ? `color-${selectedSpace.color}` : ""}`}>
          <div><span className="property-modal-kicker">PROPERTY REGISTER · {selectedSpace.type.toUpperCase()}</span><h2 id="property-modal-title">{selectedSpace.name}</h2><p>{selectedSpace.subtitle}</p></div>
          <button className="constitution-close" onClick={() => onClose()} aria-label="Close property details">CLOSE ×</button>
        </header>
        <div className="property-modal-body">
          <div className="property-detail-grid">
            <div className="property-detail"><span>LISTED PRICE</span><strong>{selectedSpace.price !== undefined ? money(selectedSpace.price) : "—"}</strong></div>
            <div className="property-detail"><span>BASE RENT</span><strong>{selectedSpace.type === "utility" ? "Variable" : selectedSpace.price !== undefined ? money(getBaseRent(selectedSpace.id)) : "—"}</strong></div>
            <div className="property-detail"><span>OWNER</span><strong>{game.cooperativePropertyIds.includes(selectedSpace.id) ? "Citizens' Cooperative" : selectedOwner?.name ?? "Unclaimed"}</strong></div>
            <div className="property-detail"><span>LEASEHOLDER</span><strong>{selectedLeaseholder ? (selectedLeaseholder.name) : "None"}</strong></div>
          </div>
          <div className="property-detail-status"><span>STATUS</span><strong>{selectedProperty?.mortgaged ? "Mortgaged — no rent collected" : game.cooperativePropertyIds.includes(selectedSpace.id) ? "Shared cooperative property" : selectedOwner ? "Owned" : selectedLeaseholder ? "Leased" : "Available to purchase or lease"}</strong></div>
          {selectedSpace.type === "property" && selectedProperty?.ownerId === current.id && <div className="property-detail-status"><span>DEVELOPMENT</span><strong>{selectedProperty.hotel ? "Hotel · 6× base rent" : (selectedProperty.houses ?? 0) > 0 ? (selectedProperty.houses + " house(s) · " + ((selectedProperty.houses ?? 0) + 1) + "× base rent") : "Undeveloped · 1× base rent"}</strong><p className="property-detail-note">Houses cost ৳200 / ৳300 / ৳400; a hotel costs ৳600. Citizens must own the full color group and build evenly. Politicians pay half price and may build a hotel directly. Citizen maintenance is ৳50 per house or ৳200 per hotel each time they pass GO.</p>
          {current.controller === "human" && isCurrentPlayerTurn && !selectedProperty.mortgaged && !selectedProperty.leaseholderId && !game.cooperativePropertyIds.includes(selectedSpace.id) && !selectedProperty.hotel && <div className="property-modal-actions">
            {(selectedProperty.houses ?? 0) < 3 && <button className="sell-property-button" disabled={current.cash < getBuildingCost(current.role, "house", selectedProperty.houses ?? 0) || !citizenCanBuildSelected} onClick={() => onBuild(selectedSpace.id, "house")}>BUILD HOUSE <span>{money(getBuildingCost(current.role, "house", selectedProperty.houses ?? 0))}</span></button>}
            {(current.role === "politician" || (selectedProperty.houses ?? 0) === 3) && <button className="sell-property-button" disabled={current.cash < getBuildingCost(current.role, "hotel", selectedProperty.houses ?? 0) || !citizenCanBuildSelected} onClick={() => onBuild(selectedSpace.id, "hotel")}>BUILD HOTEL <span>{money(getBuildingCost(current.role, "hotel", selectedProperty.houses ?? 0))}</span></button>}
          </div>}</div>}

          {selectedProperty?.ownerId === current.id && selectedSpace.price !== undefined && <div className="property-detail-status"><span>MORTGAGE TERMS · {roleName(current.role).toUpperCase()}</span><strong>{selectedProperty.mortgaged ? `Clear for ${money(getMortgageTerms(current.role, selectedSpace.price).redemptionAmount)}` : `Receive ${money(getMortgageTerms(current.role, selectedSpace.price).netAdvance)} net`}</strong><p className="property-detail-note">{selectedProperty.mortgaged ? `Principal plus ${current.role === "politician" ? "8%" : "10%"} interest on the original loan amount. Rent is suspended until cleared.` : current.role === "politician" ? "Full listed price, no processing fee; 8% interest on the loan principal to clear." : `Half the listed price less a 5% fee on the loan amount (${money(getMortgageTerms(current.role, selectedSpace.price).processingFee)}); 10% interest on the loan principal to clear.`}</p></div>}
          <p className="property-detail-note">{selectedSpace.type === "utility"
            ? "Utility rent is calculated from the player's dice roll and the applicable role rules."
            : selectedSpace.type === "railroad"
              ? "Railroad rent depends on the railroad holdings and applicable role rules."
              : "Actual rent may differ from base rent depending on the owner's role, lease terms, and any applicable game rules."}</p>
        </div>
        <footer className="property-modal-footer"><span>THE REPUBLIC OF OPPORTUNITY · SPACE {BOARD.findIndex((space) => space.id === selectedSpace.id)}</span><div className="property-modal-actions">
          {selectedProperty?.ownerId === current.id && current.controller === "human" && isCurrentPlayerTurn && !selectedProperty.leaseholderId && !game.cooperativePropertyIds.includes(selectedSpace.id) && selectedSpace.price !== undefined && <button className="sell-property-button" disabled={selectedProperty.mortgaged ? current.cash < getMortgageTerms(current.role, selectedSpace.price).redemptionAmount : current.role === "citizen" && (game.players.find((player) => player.role === "politician")?.cash ?? 0) < selectedSpace.price} onClick={() => {
            if (selectedProperty.mortgaged) {
              onRedeem(selectedSpace.id);
            } else {
              onSell(selectedSpace.id);
            }
            onClose();
          }}>{selectedProperty.mortgaged ? (current.cash >= getMortgageTerms(current.role, selectedSpace.price).redemptionAmount ? "CLEAR MORTGAGE" : "NOT ENOUGH CASH TO CLEAR") : current.role === "politician" ? "SELL TO GOVERNMENT" : (game.players.find((player) => player.role === "politician")?.cash ?? 0) < selectedSpace.price ? "POLITICIAN NEEDS CASH" : "SELL TO POLITICIAN"} <span>{selectedProperty.mortgaged ? money(getMortgageTerms(current.role, selectedSpace.price).redemptionAmount) : current.role === "citizen" ? `${money(selectedSpace.price - Math.floor(selectedSpace.price / 10))} net` : money(selectedSpace.price)}</span></button>}
          {selectedProperty?.ownerId === current.id && current.controller === "human" && isCurrentPlayerTurn && !selectedProperty.leaseholderId && !selectedProperty.mortgaged && !game.cooperativePropertyIds.includes(selectedSpace.id) && selectedSpace.price !== undefined && <button className="sell-property-button" onClick={() => {
            onMortgage(selectedSpace.id);
            onClose();
          }}>MORTGAGE PROPERTY <span>+{money(getMortgageTerms(current.role, selectedSpace.price).netAdvance)}</span></button>}
        </div></footer>
      </section>
    </div>;
}
