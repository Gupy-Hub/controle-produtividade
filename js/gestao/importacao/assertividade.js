window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 500, // Reduzi levemente para garantir estabilidade no insert
    CONCURRENCY: 1,

    // Função de limpeza robusta
    higienizar: function(valor, tipo) {
        if (valor === undefined || valor === null) return null;
        
        // Remove espaços e caracteres invisíveis do valor
        let limpo = String(valor).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        if (limpo === "" || 
            limpo.toLowerCase() === "nan" || 
            limpo.toLowerCase() === "null" || 
            limpo.toLowerCase() === "undefined") {
            return null;
        }

        if (tipo === 'numero') {
            // Remove % e troca virgula por ponto
            let num = parseFloat(limpo.replace('%', '').replace(',', '.'));
            return isNaN(num) ? null : num;
        }

        if (tipo === 'data') {
            try {
                // Caso 1: ISO vindo do end_time (2025-12-02T12:17...)
                // Pega tudo antes do 'T' para garantir YYYY-MM-DD puro
                if (limpo.includes('T')) {
                    return limpo.split('T')[0];
                }
                
                // Caso 2: Data simples já formatada (2025-12-02)
                if (limpo.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    return limpo;
                }

                // Caso 3: Formato Brasileiro (16/12/2025)
                if (limpo.includes('/')) {
                    const p = limpo.split('/');
                    if (p.length === 3) {
                        return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
                    }
                }
            } catch (e) {
                console.warn("Falha ao converter data:", limpo);
                return null;
            }
        }

        return limpo;
    },

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const btn = input.closest('div').querySelector('button');
            const originalText = btn.innerHTML;
            
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESSANDO...';
            btn.disabled = true;

            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "ISO-8859-1",
                // AQUI ESTÁ A CORREÇÃO MÁGICA DO BOM (Lixo invisível no header)
                transformHeader: function(header) {
                    return header.trim().replace(/[\uFEFF\u200B]/g, '');
                },
                complete: async (results) => {
                    try {
                        await this.tratarEEnviar(results.data);
                    } catch (err) {
                        console.error("Erro crítico no processamento:", err);
                        alert(`Erro ao processar: ${err.message}`);
                    } finally {
                        input.value = '';
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                }
            });
        }
    },

    tratarEEnviar: async function(linhas) {
        const payload = [];
        const idsUnicos = new Set();
        let contagemSemData = 0;

        console.log(`🛠️ Iniciando processamento de ${linhas.length} linhas...`);

        for (const linha of linhas) {
            // A chave 'end_time' agora será encontrada corretamente graças ao transformHeader
            const idPpc = this.higienizar(linha['ID PPC']);
            
            if (!idPpc || idsUnicos.has(idPpc)) continue;
            idsUnicos.add(idPpc);

            // Garante a data de referência pura (YYYY-MM-DD)
            const dataRef = this.higienizar(linha['end_time'], 'data');
            
            if (!dataRef) {
                contagemSemData++;
                continue; // Pula registro se não conseguir extrair a data
            }

            // Prepara o timestamp completo para a coluna end_time
            // Remove o 'Z' final para gravar como timestamp without time zone (local)
            let endTimeRaw = this.higienizar(linha['end_time']);
            if (endTimeRaw && endTimeRaw.endsWith('Z')) {
                endTimeRaw = endTimeRaw.slice(0, -1); 
            }

            const registro = {
                id_ppc: idPpc,
                data_referencia: dataRef, // Vai para coluna DATE
                end_time: endTimeRaw,     // Vai para coluna TIMESTAMP
                
                // Mapeamento direto com base no seu CSV
                empresa_id: this.higienizar(linha['Company_id']),
                empresa: this.higienizar(linha['Empresa']),
                schema_id: this.higienizar(linha['Schema_id']), // Adicionado baseado no CSV
                
                assistente: this.higienizar(linha['Assistente']),
                nome_assistente: this.higienizar(linha['Assistente']),
                
                auditora: this.higienizar(linha['Auditora']),
                nome_auditora_raw: this.higienizar(linha['Auditora']),
                
                doc_name: this.higienizar(linha['doc_name']),
                nome_documento: this.higienizar(linha['doc_name']), // Redundância útil para search
                
                status: this.higienizar(linha['STATUS']),
                observacao: this.higienizar(linha['Apontamentos/obs']),
                obs: this.higienizar(linha['Apontamentos/obs']),
                
                // Métricas numéricas
                num_campos: this.higienizar(linha['nº Campos'], 'numero'),
                campos: this.higienizar(linha['nº Campos'], 'numero'),
                
                qtd_ok: this.higienizar(linha['Ok'], 'numero'),
                ok: this.higienizar(linha['Ok'], 'numero'),
                
                qtd_nok: this.higienizar(linha['Nok'], 'numero'),
                nok: this.higienizar(linha['Nok'], 'numero'),
                
                porcentagem: this.higienizar(linha['% Assert']), // Mantém texto com %
                
                data_auditoria: this.higienizar(linha['Data da Auditoria '], 'data'),
                qtd_validados: this.higienizar(linha['Quantidade_documentos_validados'], 'numero'),
                
                revalidacao: this.higienizar(linha['Revalidação']),
                fila: this.higienizar(linha['Fila'])
            };

            payload.push(registro);
        }

        if (contagemSemData > 0) {
            console.warn(`⚠️ ${contagemSemData} registros ignorados por data inválida.`);
        }

        if (payload.length > 0) {
            await this.enviarLotes(payload);
        } else {
            alert("Nenhum dado válido para importar. Verifique se o CSV está correto.");
        }
    },

    enviarLotes: async function(dados) {
        // Ordena por data para inserção ficar mais organizada no log
        dados.sort((a, b) => new Date(a.data_referencia) - new Date(b.data_referencia));

        let totalSucesso = 0;
        let totalErros = 0;

        for (let i = 0; i < dados.length; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            
            // Upsert baseado no id_ppc
            const { error } = await Sistema.supabase
                .from('assertividade')
                .upsert(lote, { onConflict: 'id_ppc' });

            if (error) {
                console.error(`❌ Erro no lote ${i}:`, error.message);
                totalErros += lote.length;
            } else {
                totalSucesso += lote.length;
                console.log(`✅ Lote processado: ${totalSucesso} / ${dados.length}`);
            }
        }

        let msg = `Processamento Finalizado!\n\nSalvos: ${totalSucesso}\nErros: ${totalErros}`;
        if (totalErros > 0) msg += "\n(Verifique o console (F12) para detalhes dos erros)";
        
        alert(msg);
        
        // Atualiza a tela se o controller estiver ativo
        if (window.Gestao && Gestao.Assertividade && typeof Gestao.Assertividade.carregar === 'function') {
            Gestao.Assertividade.carregar();
        }
    }
};