export type TagVariant = { tagId: string; candidateId: string; reason: string };

export function detectTagVariants(tags: Array<{ id: string; name: string }>): TagVariant[] {
  const variants: TagVariant[] = [];
  for (let index = 0; index < tags.length; index += 1) {
    for (let candidateIndex = index + 1; candidateIndex < tags.length; candidateIndex += 1) {
      const left = normalized(tags[index].name);
      const right = normalized(tags[candidateIndex].name);
      const reason = variantReason(left, right);
      if (reason) variants.push({ tagId: tags[index].id, candidateId: tags[candidateIndex].id, reason });
    }
  }
  return variants;
}

function variantReason(left: string, right: string): string | null {
  if (!left || !right || left === right) return left === right ? "Même écriture normalisée" : null;
  if (singular(left) === singular(right)) return "Variante singulier/pluriel";
  if (Math.max(left.length, right.length) >= 5 && levenshtein(left, right) <= 1) return "Orthographe très proche";
  return null;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, "");
}

function singular(value: string) {
  return value.length > 3 && value.endsWith("s") ? value.slice(0, -1) : value;
}

function levenshtein(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length];
}
