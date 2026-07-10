import { AlertCircle, ImageOff, SearchX, Upload } from "lucide-react";

export function EmptyLibrary({ onImport }: { onImport: () => void }) {
  return (
    <div className="empty-state">
      <Upload aria-hidden="true" className="size-6" />
      <h2 className="text-balance text-lg font-semibold">Votre mosaïque attend ses premiers souvenirs</h2>
      <p className="max-w-md text-pretty text-sm text-muted">
        Importez votre export JSON pour commencer à explorer vos publications sauvegardées.
      </p>
      <button className="button button-primary" type="button" onClick={onImport}>
        Importer un fichier JSON
      </button>
    </div>
  );
}

export function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <div className="empty-state">
      <SearchX aria-hidden="true" className="size-6" />
      <h2 className="text-balance text-lg font-semibold">Aucun souvenir ne correspond</h2>
      <p className="text-pretty text-sm text-muted">Modifiez votre recherche ou effacez les filtres actifs.</p>
      <button className="button" type="button" onClick={onReset}>
        Effacer les filtres
      </button>
    </div>
  );
}

export function LibraryError({ message }: { message: string }) {
  return (
    <div className="empty-state" role="alert">
      <AlertCircle aria-hidden="true" className="size-6" />
      <h2 className="text-balance text-lg font-semibold">La bibliothèque n’a pas pu être chargée</h2>
      <p className="max-w-md text-pretty text-sm text-muted">{message}</p>
      <button className="button" type="button" onClick={() => window.location.reload()}>
        Réessayer
      </button>
    </div>
  );
}

export function BrokenImage() {
  return (
    <div className="broken-image" role="img" aria-label="Image indisponible">
      <ImageOff aria-hidden="true" className="size-6" />
      <span>Image indisponible</span>
    </div>
  );
}
