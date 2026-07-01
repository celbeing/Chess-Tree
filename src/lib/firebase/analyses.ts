import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { GameTree } from "@/lib/chess-tree/types";
import {
  createAnalysisRecord,
  createAnalysisUpdateRecord,
  parseAnalysisRecord,
  toAnalysisSummary,
  type AnalysisSummary,
} from "@/lib/firebase/analysisRecords";

export async function listAnalyses(db: Firestore, uid: string): Promise<AnalysisSummary[]> {
  const snapshot = await getDocs(query(analysesCollection(db, uid), orderBy("updatedAt", "desc")));

  return snapshot.docs
    .map((analysisDoc) => toAnalysisSummary(analysisDoc.id, analysisDoc.data()))
    .filter((summary): summary is AnalysisSummary => Boolean(summary));
}

export async function loadAnalysis(db: Firestore, uid: string, analysisId: string): Promise<GameTree> {
  const snapshot = await getDoc(doc(analysesCollection(db, uid), analysisId));

  if (!snapshot.exists()) {
    throw new Error("분석을 찾을 수 없습니다.");
  }

  const record = parseAnalysisRecord(snapshot.data());

  if (!record) {
    throw new Error("저장된 분석 형식이 지원되지 않습니다.");
  }

  return record.tree;
}

export async function saveAnalysis(
  db: Firestore,
  uid: string,
  tree: GameTree,
  analysisId?: string | null,
): Promise<string> {
  if (analysisId) {
    const analysisRef = doc(analysesCollection(db, uid), analysisId);
    const existing = await getDoc(analysisRef);

    await setDoc(analysisRef, existing.exists() ? createAnalysisUpdateRecord(tree) : createAnalysisRecord(tree), {
      merge: existing.exists(),
    });

    return analysisId;
  }

  const created = await addDoc(analysesCollection(db, uid), createAnalysisRecord(tree));

  return created.id;
}

function analysesCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "analyses");
}
