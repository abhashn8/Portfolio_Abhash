# scripts/clusterFaqLogs.py

import firebase_admin
from firebase_admin import credentials, firestore
import numpy as np
from sklearn.cluster import DBSCAN

# 1) Initialize the Firebase Admin SDK
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

# 2) Load all faqLogs docs that have embeddings
docs = list(db.collection('faqLogs').stream())
embs = np.array([doc.to_dict().get('embedding', []) for doc in docs])

# 3) Run DBSCAN clustering on the embeddings
cl = DBSCAN(metric='cosine', eps=0.2, min_samples=2)
labels = cl.fit_predict(embs)

# 4) Write back the numeric cluster label to each faqLog doc
for doc, lbl in zip(docs, labels):
    # cast lbl to a plain int
    py_lbl = int(lbl)
    doc.reference.update({'cluster': py_lbl})
    print(f"Tagged {doc.id} → cluster {py_lbl}")

# 5) Build and write a summary collection of clusters
clusters = {}
for doc, lbl in zip(docs, labels):
    py_lbl = int(lbl)
    clusters.setdefault(py_lbl, []).append(doc)

for lbl, members in clusters.items():
    # pick the first question in the cluster as representative
    rep_q = members[0].to_dict().get('question', '<no question>')
    size  = int(len(members))  # ensure this is a Python int

    db.collection('faqClusters').document(str(lbl)).set({
        'cluster':        lbl,             # now a plain int
        'representative': rep_q,
        'size':           size,
    })
    print(f"Cluster {lbl}: rep='{rep_q}' size={size}")

print("Clustering complete!")
