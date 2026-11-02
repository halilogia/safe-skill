<div align="center">

# 🛡️ Safe-Skill (Türkçe Kılavuz)

**Claude Code, Cursor, Windsurf ve Google Antigravity için Güvenlik Öncelikli Çoklu Ajan Beceri Yöneticisi.**<br>
Sıfır güvenli keşif, S0/S1 prompt injection savunması, SHA-256 kriptografik pasaport mühürleme ve çapraz ekosistem kurulumu.

[**English Documentation**](README.md) · [**Türkçe**](README.tr.md)

</div>

---

## ⚡ Neden Safe-Skill?

Topluluk depolarından (`skills.sh` vb.) indirilen beceriler, geliştirici makinenizde doğrudan komut ve prompt talimatı çalıştırır. Standart beceri yöneticilerinde **hiçbir güvenlik doğrulaması bulunmaz**:
* 🔴 Doğrulanmamış bir beceri **prompt injection** (`ignore previous instructions`, `dan mode`) içerebilir.
* 🔴 Hassas anahtarları (`~/.ssh`, `~/.aws/credentials`) sızdırmaya çalışabilir.
* 🔴 Zararlı sistem komutları (`rm -rf /`, `curl ... | sh`, `Format-Volume`) yürütebilir.
* 🔴 Upstream repolarda sonradan yapılan zararlı güncellemeler (TOCTOU) fark edilmeden sisteme girebilir.

---

## 🛡️ Safe-Skill Mimarisi

1. **S0/S1 Güvenlik Kapısı (Security Gate):** Statik AST/Regex motoru ile prompt injection, jailbreak, komut sızdırma ve yıkıcı kabuk çağrılarını kurulumdan önce engeller.
2. **Kriptografik Pasaport (`passport.json`):** Kurulan dosyaların SHA-256 hash özetini mühürler. Dosyalarda sonradan izinsiz bir değişiklik yapılırsa anında alarm verir.
3. **Çapraz Ajan Desteği (Cross-Ecosystem):** İndirilen beceriyi seçilen platforma otomatik uyarlar:
   * **Claude Code:** `.claude/skills/<beceri>/SKILL.md`
   * **Cursor:** `.cursor/rules/<beceri>.mdc`
   * **Antigravity:** `~/.gemini/config/skills/<beceri>/SKILL.md`
4. **Bağımlılık Doktoru (`doctor`):** Beceri için gerekli olan `ffmpeg`, `yt-dlp`, `git`, `python`, `node` gibi araçların sistemde hazır olup olmadığını doğrular.
5. **Akıllı Proje Tespiti:** Projenizdeki teknoloji yığınını (TypeScript, Python, Godot, Rust, Android, MCP) otomatik tarayarak uygun becerileri proaktif olarak tavsiye eder.
6. **Güvenli Güncelleme:** Upstream depolardan gelen güncellemeleri önce güvenlik kapısından geçirir; zararlı kod eklenmişse güncellemeyi engeller.

---

## 🚀 Hızlı Başlangıç

Kurulum gerektirmeden `npx` ile anında çalıştırın:

```bash
# Etkileşimli TUI menüsünü aç
npx safe-skill

# Çalışılan projeyi analiz et ve uygun becerileri öner
npx safe-skill

# Anthropic resmi ve topluluk becerilerini ara
npx safe-skill search frontend

# Güvenlik kapısı doğrulamasıyla beceri kur
npx safe-skill install safe-git

# Belirli bir ajan platformu için kur
npx safe-skill install frontend-design --target claude
npx safe-skill install mcp-builder --target cursor

# Kurulu becerilerin güncellik ve pasaport durumunu denetle
npx safe-skill check

# Güvenlik doğrulamalı güncelleme yap
npx safe-skill update frontend-design

# Sistem araç bağımlılıklarını test et
npx safe-skill doctor
```

---

## 📄 Lisans
MIT © 2026 Halil Emre
