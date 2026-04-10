from __future__ import annotations

import httpx
import re
from html import unescape
from xml.etree import ElementTree


def _split_sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]


class PubMedClient:
    BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

    async def search(self, query: str, max_results: int = 5) -> list[str]:
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": max_results,
            "sort": "relevance",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(f"{self.BASE}/esearch.fcgi", params=params)
            response.raise_for_status()
            data = response.json()
        return data.get("esearchresult", {}).get("idlist", [])

    async def fetch(self, pmids: list[str]) -> list[dict]:
        if not pmids:
            return []
        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(f"{self.BASE}/efetch.fcgi", params=params)
            response.raise_for_status()
        root = ElementTree.fromstring(response.text)
        articles: list[dict] = []
        for article in root.findall(".//PubmedArticle"):
            pmid = article.findtext(".//PMID") or ""
            title = "".join(article.find(".//ArticleTitle").itertext()) if article.find(".//ArticleTitle") is not None else "Untitled article"
            abstract_parts = []
            abstract_sections = []
            for node in article.findall(".//Abstract/AbstractText"):
                text = "".join(node.itertext()).strip()
                if not text:
                    continue
                label = node.attrib.get("Label") or node.attrib.get("NlmCategory")
                abstract_parts.append(text)
                abstract_sections.append(
                    {
                        "label": label,
                        "text": text,
                        "sentences": _split_sentences(text),
                    }
                )
            year_text = article.findtext(".//PubDate/Year")
            authors = []
            for author in article.findall(".//Author"):
                last_name = author.findtext("LastName")
                initials = author.findtext("Initials")
                if last_name:
                    authors.append(f"{last_name} {initials or ''}".strip())
            publication_types = [
                node.text.strip()
                for node in article.findall(".//PublicationTypeList/PublicationType")
                if node.text and node.text.strip()
            ]
            articles.append(
                {
                    "id": f"PMID:{pmid}",
                    "title": title,
                    "summary": " ".join(abstract_parts)[:1200] if abstract_parts else "Abstract not available.",
                    "year": int(year_text) if year_text and year_text.isdigit() else None,
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else None,
                    "authors": authors[:5],
                    "publication_types": publication_types,
                    "abstract_sections": abstract_sections,
                }
            )
        return articles


class ClinicalTrialsClient:
    BASE = "https://clinicaltrials.gov/api/query/study_fields"

    async def search(self, query: str, max_results: int = 5) -> list[dict]:
        params = {
            "expr": query,
            "fields": "NCTId,BriefTitle,OverallStatus,Phase,BriefSummary,Condition,InterventionName",
            "min_rnk": 1,
            "max_rnk": max_results,
            "fmt": "json",
        }
        headers = {"User-Agent": "CareProofDemo/0.1"}
        async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
            response = await client.get(self.BASE, params=params)
            if response.status_code == 200:
                data = response.json()
                studies = data.get("StudyFieldsResponse", {}).get("StudyFields", [])
                normalized = []
                for study in studies:
                    nct_id = (study.get("NCTId") or [""])[0]
                    normalized.append(
                        {
                            "id": nct_id,
                            "title": (study.get("BriefTitle") or ["Untitled trial"])[0],
                            "summary": (study.get("BriefSummary") or ["Summary not available."])[0],
                            "status": (study.get("OverallStatus") or [None])[0],
                            "phase": (study.get("Phase") or [None])[0],
                            "url": f"https://clinicaltrials.gov/study/{nct_id}" if nct_id else None,
                            "condition": (study.get("Condition") or [None])[0],
                            "intervention": (study.get("InterventionName") or [None])[0],
                        }
                    )
                if normalized:
                    return normalized
        return await self._search_via_public_result_page(query, max_results)

    async def _search_via_public_result_page(self, query: str, max_results: int) -> list[dict]:
        search_url = "https://html.duckduckgo.com/html/"
        search_query = f"site:clinicaltrials.gov/study {query}"
        async with httpx.AsyncClient(
            timeout=20.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; CareProofDemo/0.1)"},
        ) as client:
            response = await client.post(search_url, data={"q": search_query})
            response.raise_for_status()
            html = response.text

        result_pattern = re.compile(
            r'<a rel="nofollow" class="result__a" href="(?P<url>[^"]+)">(?P<title>.*?)</a>.*?'
            r'<a class="result__snippet" href="[^"]+">(?P<snippet>.*?)</a>',
            re.DOTALL,
        )

        normalized: list[dict] = []
        for match in result_pattern.finditer(html):
            url = unescape(match.group("url"))
            if "clinicaltrials.gov/study/" not in url:
                continue
            nct_match = re.search(r"(NCT\d{8})", url)
            if not nct_match:
                continue
            title = re.sub(r"<.*?>", "", match.group("title")).strip()
            snippet = re.sub(r"<.*?>", "", match.group("snippet")).strip()
            normalized.append(
                {
                    "id": nct_match.group(1),
                    "title": title or "Clinical trial result",
                    "summary": snippet or "Summary not available from public search result.",
                    "status": None,
                    "phase": None,
                    "url": url,
                    "condition": None,
                    "intervention": None,
                }
            )
            if len(normalized) >= max_results:
                break
        return normalized
