window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 500,
    CONCURRENCY: 1,

    // Converte DD/MM/YYYY para YYYY-MM-DD (Obrigatório para PostgreSQL)
    formatarDataISO: function(dataStr) {
        if (!dataStr || dataStr.trim() === "") return null;
        const partes = dataStr.trim().split('/');
        if (partes.length === 3) {
            // Garante que o ano tenha 4 dígitos e mês/dia tenham 2
            const dia = partes[0].padStart(2, '0');
            const mes = partes[1].padStart(2, '0');
            const ano = partes[2];
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    limparDado: function(val, isNumeric = false) {
        if (val === undefined || val === null) return null;
        const str = String(val).trim();
        if (str === "" || str.toLowerCase() === "nan") return null;

        if (isNumeric) {
            const num = parseFloat(str.replace('%', '').replace(',', '.'));
            return isNaN(num) ? null : num;
        }
        return str;
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

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const idPpc = this.limparDado(linha['ID PPC']);
            if (!idPpc) continue;

            if (cacheIds.has(idPpc)) continue;
            cacheIds.add(idPpc);

            // Tratamento de Data via end_time (Dashboard)
            let dataRef = null;
            if (linha['end_time']) {
                const d = new Date(linha['end_time']);
                if (!isNaN(d.getTime())) dataRef = d.toISOString().split('T')[0];
            }

            // CORREÇÃO DO ERRO OUT OF RANGE: Formata Data da Auditoria
            const dataAuditoriaISO = this.formatarDataISO(linha['Data da Auditoria ']);

            listaParaSalvar.push({
                id_ppc: idPpc,
                data_referencia: dataRef,
                end_time: linha['end_time'],
                
                // Mapeamento das colunas numéricas corrigido
                empresa_id: this.limparDado(linha['Company_id']),
                empresa: this.limparDado(linha['Empresa']),
                obs: this.limparDado(linha['Apontamentos/obs']),
                observacao: this.limparDado(linha['Apontamentos/obs']),
                num_campos: this.limparDado(linha['nº Campos'], true),
                campos: this.limparDado(linha['nº Campos'], true),
                qtd_ok: this.limparDado(linha['Ok'], true),
                ok: this.limparDado(linha['Ok'], true),
                qtd_nok: this.limparDado(linha['Nok'], true),
                nok: this.limparDado(linha['Nok'], true),
                
                assistente: this.limparDado(linha['Assistente']),
                nome_assistente: this.limparDado(linha['Assistente']),
                doc_name: this.limparDado(linha['doc_name']),
                status: this.limparDado(linha['STATUS']),
                
                // Auditora RIGOROSA: Nulo se vazio
                auditora: this.limparDado(linha['Auditora']), 
                nome_auditora_raw: this.limparDado(linha['Auditora']),
                
                porcentagem: this.limparDado(linha['% Assert'], true),
                
                // Data formatada para YYYY-MM-DD
                data_auditoria: dataAuditoriaISO,
                
                qtd_validados: this.limparDado(linha['Quantidade_documentos_validados'], true)
            });
        }
        await this.enviarLotes(listaParaSalvar);
    },

    enviarLotes: async function(dados) {
        for (let i = 0; i < dados.length; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { onConflict: 'id_ppc' });

            if (error) {
                console.error("❌ Falha no envio:", error.message);
                // O erro "out of range" aparecerá aqui se a data ainda estiver errada
            } else {
                console.log(`✅ Lote enviado: ${Math.min(i + this.BATCH_SIZE, dados.length)} / ${dados.length}`);
            }
        }
        alert("Importação Finalizada! Verifique as datas agora.");
    }
};