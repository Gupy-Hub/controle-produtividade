window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 500,
    CONCURRENCY: 1,

    // Limpeza profunda: Garante que Nulo seja Nulo e remove espaços
    limpar: function(val, numeric = false) {
        if (val === undefined || val === null) return null;
        const s = String(val).trim();
        if (s === "" || s.toLowerCase() === "nan" || s.toLowerCase() === "null") return null;
        if (numeric) {
            const n = parseFloat(s.replace('%', '').replace(',', '.'));
            return isNaN(n) ? null : n;
        }
        return s;
    },

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const btn = input.closest('div').querySelector('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
            btn.disabled = true;

            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", 
                complete: async (results) => {
                    await this.tratarEEnviar(results.data);
                    input.value = ''; 
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        }
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];
        const cacheIds = new Set();

        console.log("⚙️ Extraindo datas e mapeando colunas...");

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const idPpc = this.limpar(linha['ID PPC']);
            if (!idPpc) continue;

            if (cacheIds.has(idPpc)) continue;
            cacheIds.add(idPpc);

            // --- CORREÇÃO DA DATA (data_referencia) ---
            // Pegamos o end_time (2025-12-01T...) e cortamos apenas os 10 primeiros caracteres (2025-12-01)
            let dataRef = null;
            const rawEndTime = this.limpar(linha['end_time']);
            if (rawEndTime && rawEndTime.length >= 10) {
                dataRef = rawEndTime.substring(0, 10); 
            }

            // Formatação da Data da Auditoria (DD/MM/YYYY -> YYYY-MM-DD)
            let dataAudit = null;
            const rawAudit = this.limpar(linha['Data da Auditoria ']);
            if (rawAudit && rawAudit.includes('/')) {
                const p = rawAudit.split('/');
                if (p.length === 3) dataAudit = `${p[2]}-${p[1]}-${p[0]}`;
            }

            listaParaSalvar.push({
                id_ppc: idPpc,
                data_referencia: dataRef, // Agora salva apenas '2025-12-01'
                end_time: rawEndTime,
                data_auditoria: dataAudit,
                
                // Id da empresa e Empresa
                empresa_id: this.limpar(linha['Company_id']),
                empresa: this.limpar(linha['Empresa']),

                // Observação (Mapeia para os dois nomes possíveis no banco)
                obs: this.limpar(linha['Apontamentos/obs']),
                observacao: this.limpar(linha['Apontamentos/obs']),

                // Campos, Ok, Nok (Garante que vazios sejam NULL)
                num_campos: this.limpar(linha['nº Campos'], true),
                campos: this.limpar(linha['nº Campos'], true),
                qtd_ok: this.limpar(linha['Ok'], true),
                ok: this.limpar(linha['Ok'], true),
                qtd_nok: this.limpar(linha['Nok'], true),
                nok: this.limpar(linha['Nok'], true),

                // Assistente e Auditora (Rigoroso contra vazios)
                assistente: this.limpar(linha['Assistente']),
                nome_assistente: this.limpar(linha['Assistente']),
                auditora: this.limpar(linha['Auditora']),
                nome_auditora_raw: this.limpar(linha['Auditora']),

                doc_name: this.limpar(linha['doc_name']),
                status: this.limpar(linha['STATUS']),
                porcentagem: this.limpar(linha['% Assert'], true),
                qtd_validados: this.limpar(linha['Quantidade_documentos_validados'], true)
            });
        }
        await this.enviarLotes(listaParaSalvar);
    },

    enviarLotes: async function(dados) {
        const total = dados.length;
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { onConflict: 'id_ppc' });

            if (error) console.error("❌ Erro no lote:", error.message);
            else console.log(`✅ Sucesso: ${Math.min(i + this.BATCH_SIZE, total)} / ${total}`);
        }
        alert("Importação Concluída! Datas e Auditoras corrigidas.");
    }
};