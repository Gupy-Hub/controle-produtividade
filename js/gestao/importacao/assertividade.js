window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 800,
    CONCURRENCY: 1,

    // HIGIENIZAÇÃO DE CHOQUE: Remove lixo invisível e força NULL real
    higienizar: function(valor, tipo) {
        if (valor === undefined || valor === null) return null;
        
        // Remove espaços em branco, quebras de linha e caracteres de controle do Excel
        let limpo = String(valor).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        if (limpo === "" || limpo.toLowerCase() === "nan" || limpo.toLowerCase() === "null" || limpo.toLowerCase() === "undefined") {
            return null;
        }

        if (tipo === 'numero') {
            let num = parseFloat(limpo.replace('%', '').replace(',', '.'));
            return isNaN(num) ? null : num;
        }

        if (tipo === 'data') {
            // Se for end_time (2025-12-01T...), extrai os primeiros 10 caracteres
            if (limpo.includes('-')) return limpo.substring(0, 10);
            // Se for Data Auditoria (16/12/2025), inverte para ISO
            if (limpo.includes('/')) {
                const p = limpo.split('/');
                return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
            }
        }

        return limpo;
    },

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const btn = input.closest('div').querySelector('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> HIGIENIZANDO...';
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
        const payload = [];
        const idsUnicos = new Set();

        console.log("🛠️ Iniciando Higienização Estrutural...");

        for (const linha of linhas) {
            const idPpc = this.higienizar(linha['ID PPC']);
            if (!idPpc || idsUnicos.has(idPpc)) continue;
            idsUnicos.add(idPpc);

            const registro = {
                id_ppc: idPpc,
                // FORÇA DATA DO DIA 01 AO 08 SEM FUSO HORÁRIO
                data_referencia: this.higienizar(linha['end_time'], 'data'),
                end_time: this.higienizar(linha['end_time']),
                
                // AUDITORA: Se no CSV estiver vazio, aqui vira NULL absoluto
                auditora: this.higienizar(linha['Auditora']),
                nome_auditora_raw: this.higienizar(linha['Auditora']),
                
                assistente: this.higienizar(linha['Assistente']),
                nome_assistente: this.higienizar(linha['Assistente']),
                doc_name: this.higienizar(linha['doc_name']),
                status: this.higienizar(linha['STATUS']),
                
                // MAPEAMENTO DE DADOS SOLICITADOS
                empresa_id: this.higienizar(linha['Company_id']),
                empresa: this.higienizar(linha['Empresa']),
                obs: this.higienizar(linha['Apontamentos/obs']),
                observacao: this.higienizar(linha['Apontamentos/obs']),
                
                // NÚMEROS (Vazio = NULL, não 0)
                num_campos: this.higienizar(linha['nº Campos'], 'numero'),
                campos: this.higienizar(linha['nº Campos'], 'numero'),
                ok: this.higienizar(linha['Ok'], 'numero'),
                qtd_ok: this.higienizar(linha['Ok'], 'numero'),
                nok: this.higienizar(linha['Nok'], 'numero'),
                qtd_nok: this.higienizar(linha['Nok'], 'numero'),
                porcentagem: this.higienizar(linha['% Assert'], 'numero'),
                
                data_auditoria: this.higienizar(linha['Data da Auditoria '], 'data'),
                qtd_validados: this.higienizar(linha['Quantidade_documentos_validados'], 'numero')
            };

            payload.push(registro);
        }

        await this.enviarLotes(payload);
    },

    enviarLotes: async function(dados) {
        for (let i = 0; i < dados.length; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('assertividade')
                .upsert(lote, { onConflict: 'id_ppc' });

            if (error) console.error("❌ Falha no Lote:", error.message);
            else console.log(`✅ Lote ${i/this.BATCH_SIZE + 1} Sincronizado.`);
        }
        alert("Sincronização Concluída: Dados higienizados e nulos preservados!");
    }
};