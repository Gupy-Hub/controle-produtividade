window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 1000,
    CONCURRENCY: 5,

    // Função mestre para tratar nulos de texto (Auditora, Status, etc)
    limparTextoRigoroso: function(val) {
        if (val === undefined || val === null) return null;
        
        // Converte para string e remove espaços, quebras de linha e lixo invisível
        const str = String(val).trim().replace(/^\s+|\s+$/g, '');
        
        // Se após a limpeza a string estiver vazia, retorna NULL absoluto
        return str === "" ? null : str;
    },

    // Função mestre para números (Porcentagem, Campos, etc)
    limparNumeroRigoroso: function(val) {
        const str = this.limparTextoRigoroso(val);
        if (str === null) return null; // Vazio vira NULL, não 0
        
        const num = parseFloat(str.replace('%', '').replace(',', '.'));
        return isNaN(num) ? null : num;
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            // Pula se não houver assistente ou documento
            if (!this.limparTextoRigoroso(linha['Assistente']) && !this.limparTextoRigoroso(linha['doc_name'])) continue;

            // Tratamento de Data de Auditoria
            let dataLiteral = null;
            const dataAuditRaw = this.limparTextoRigoroso(linha['Data da Auditoria ']); 
            if (dataAuditRaw) {
                const partes = dataAuditRaw.split('/');
                if (partes.length === 3) dataLiteral = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 

            listaParaSalvar.push({
                usuario_id: parseInt(linha['id_assistente']) || null,
                data_referencia: this.limparTextoRigoroso(linha['end_time']), 
                end_time: linha['end_time'] ? new Date(linha['end_time']) : null,

                // TEXTO COM LIMPEZA RIGOROSA
                empresa: this.limparTextoRigoroso(linha['Empresa']),
                assistente: this.limparTextoRigoroso(linha['Assistente']),
                nome_assistente: this.limparTextoRigoroso(linha['Assistente']),
                
                // --- AQUI ESTAVA O ERRO: AUDITORA ---
                // Agora, se estiver em branco ou só com espaços, vai NULL
                auditora: this.limparTextoRigoroso(linha['Auditora']),
                nome_auditora_raw: this.limparTextoRigoroso(linha['Auditora']),
                
                doc_name: this.limparTextoRigoroso(linha['doc_name']),
                status: this.limparTextoRigoroso(linha['STATUS']), 
                obs: this.limparTextoRigoroso(linha['Apontamentos/obs']),
                documento_categoria: this.limparTextoRigoroso(linha['DOCUMENTO']),
                fila: this.limparTextoRigoroso(linha['Fila']),
                revalidacao: this.limparTextoRigoroso(linha['Revalidação']),
                id_ppc: this.limparTextoRigoroso(linha['ID PPC']),
                nome_ppc: this.limparTextoRigoroso(linha[' Nome da PPC']), 

                // NÚMEROS COM LIMPEZA RIGOROSA (Vazio = NULL)
                qtd_validados: this.limparNumeroRigoroso(linha['Quantidade_documentos_validados']),
                porcentagem: this.limparNumeroRigoroso(linha['% Assert']),
                num_campos: this.limparNumeroRigoroso(linha['nº Campos']),
                qtd_ok: this.limparNumeroRigoroso(linha['Ok']),
                qtd_nok: this.limparNumeroRigoroso(linha['Nok'])
            });
        }

        if (listaParaSalvar.length > 0) {
            await this.enviarLotesConcorrentes(listaParaSalvar);
        }
    },

    enviarLotesConcorrentes: async function(dados) {
        const total = dados.length;
        let processados = 0;
        const lotes = [];
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            lotes.push(dados.slice(i, i + this.BATCH_SIZE));
        }

        const processarLote = async (lote) => {
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { 
                    onConflict: 'assistente,data_referencia,doc_name,status',
                    ignoreDuplicates: false 
                });

            if (error) console.error("Erro no lote:", error.message);
            else processados += lote.length;
        };

        for (let i = 0; i < lotes.length; i += this.CONCURRENCY) {
            const grupoAtual = lotes.slice(i, i + this.CONCURRENCY);
            await Promise.all(grupoAtual.map(lote => processarLote(lote)));
        }
        alert("Importação Concluída: Onde não havia dados, agora está NULL!");
    }
};