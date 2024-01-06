import { ICard, IDeck, IPlayedCard, IPlayer, IPublicPlayer } from "../../types";
export declare function Deck(): IDeck;
export declare function PlayedCard(player: IPlayer | IPublicPlayer, card: ICard, burn?: boolean): IPlayedCard;
