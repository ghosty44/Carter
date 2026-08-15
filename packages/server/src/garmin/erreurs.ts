/** Erreur portant le code HTTP, pour savoir si une nouvelle tentative a un sens. */
export class ErreurGarmin extends Error {
  constructor(
    message: string,
    readonly statut: number | null = null,
    readonly corps: string | null = null,
  ) {
    super(message);
    this.name = 'ErreurGarmin';
  }

  /** 429 et 5xx sont transitoires ; une panne reseau aussi. */
  get reessayable(): boolean {
    if (this.statut === null) return true;
    return this.statut === 429 || this.statut >= 500;
  }
}

/** Pas de session, ou provider desactive : inutile de reessayer. */
export class ErreurNonConnecte extends ErreurGarmin {
  constructor(message: string) {
    super(message, 401, null);
    this.name = 'ErreurNonConnecte';
  }

  override get reessayable(): boolean {
    return false;
  }
}
