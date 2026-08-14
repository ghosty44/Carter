import type {
  CapacitesProvider,
  IsoDate,
  NomProvider,
  SeanceExterne,
  SeancePlanifiee,
  SeanceRealisee,
  Wellness,
} from '@carter/shared';

/**
 * Contrat unique entre le moteur de synchronisation et le monde exterieur.
 *
 * Regle d'architecture : rien en dehors de `src/providers/` ne doit connaitre
 * le nom d'un service tiers. Ajouter un provider ne touche que son adaptateur
 * et son enregistrement dans `registry.ts`.
 */
export interface PlanSyncProvider {
  readonly nom: NomProvider;
  readonly libelle: string;

  /** Faux si les cles manquent : l'UI le signale au lieu d'echouer en plein vol. */
  estConfigure(): boolean;

  capacites(): CapacitesProvider;

  /** Evenements deja presents chez le provider sur la plage donnee. */
  listerSeancesPlanifiees(debut: IsoDate, fin: IsoDate): Promise<SeanceExterne[]>;

  /** Cree l'evenement et retourne l'identifiant attribue par le provider. */
  creerSeance(planifiee: SeancePlanifiee): Promise<{ externalId: string }>;

  mettreAJourSeance(externalId: string, planifiee: SeancePlanifiee): Promise<void>;

  supprimerSeance(externalId: string): Promise<void>;

  listerActivites(debut: IsoDate, fin: IsoDate): Promise<SeanceRealisee[]>;

  listerWellness(debut: IsoDate, fin: IsoDate): Promise<Wellness[]>;
}

/** Erreur portant le code HTTP, pour que le moteur sache s'il peut reessayer. */
export class ErreurProvider extends Error {
  constructor(
    message: string,
    readonly statut: number | null = null,
    readonly corps: string | null = null,
  ) {
    super(message);
    this.name = 'ErreurProvider';
  }

  /** 429 et 5xx sont transitoires : le moteur retente avec backoff. */
  get reessayable(): boolean {
    if (this.statut === null) return true; // panne reseau
    return this.statut === 429 || this.statut >= 500;
  }
}

/** Provider non configure : echoue explicitement plutot que silencieusement. */
export class ErreurProviderNonConfigure extends ErreurProvider {
  constructor(message: string) {
    super(message, null, null);
    this.name = 'ErreurProviderNonConfigure';
  }

  override get reessayable(): boolean {
    return false;
  }
}
