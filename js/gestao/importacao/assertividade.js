window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        const atualizarStatus = (texto) => {
            btnLabel.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${texto}`;
        };
        
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');
        atualizarStatus("Lendo planilha...");

        // Pequeno delay para a interface atualizar
        await new Promise(r => setTimeout(r, 50));

        try {
            // 1. Carrega dados do Banco (Cache)
            const { data: usersData } = await Sistema.supabase.from('usuarios').select('id, nome');
            const { data: empData } = await Sistema.supabase.from('empresas').select('id, nome, subdominio');

            // Mapas de busca O(1)
            const mapUsuariosID = new Map();
            const mapUsuariosNome = new Map();
            usersData.forEach(u => {
                mapUsuariosID.set(u.id, u.id);
                mapUsuariosNome.set(this.normalizar(u.nome), u.id);
            });

            const mapEmpresas = new Map();
            empData.forEach(e => {
                const nomeOficial = e.nome;
                mapEmpresas.set(this.normalizar(e.nome), nomeOficial);
                if(e.subdominio) mapEmpresas.set(this.normalizar(e.subdominio), nomeOficial);
            });

            // 2. Leitura do Arquivo
            const linhas = await Gestao.lerArquivo(file);
            
            atualizarStatus(`Processando ${linhas.length} linhas...`);
            await new Promise(r => setTimeout(r, 10));

            const inserts = [];
            
            // Relatório de Execução
            let stats = { total: linhas.length, sucesso: 0, ignorados: 0 };
            const logNaoEncontrados = new Set(); 

            // 3. Processamento Linha a Linha
            for (const row of linhas) {
                const c = {};
                // Normaliza todas as chaves
                for (const k in row) c[this.normalizarKey(k)] = row[k];

                // --- IDENTIFICAÇÃO DO USUÁRIO ---
                // Prioridade 1: ID da planilha (id_assistente)
                let idPlanilha = parseInt(c['idassistente'] || c['id'] || c['idusuario'] || 0);
                let nomePlanilha = c['assistente'] || c['usuario'] || c['nome'] || 'Sem Nome';
                let usuarioId = null;

                if (idPlanilha && mapUsuariosID.has(idPlanilha)) {
                    usuarioId = idPlanilha;
                } else {
                    // Prioridade 2: Nome do Assistente
                    if (nomePlanilha) usuarioId = mapUsuariosNome.get(this.normalizar(nomePlanilha));
                }

                if (!usuarioId) {
                    stats.ignorados++;
                    if(nomePlanilha !== 'Sem Nome') {
                        logNaoEncontrados.add(`Assistente não cadastrado: "${nomePlanilha}" (ID CSV: ${idPlanilha || 'N/A'})`);
                    }
                    continue; 
                }

                // --- EMPRESA ---
                const nomeEmpresaRaw = c['empresa'] || '';
                const empresaOficial = mapEmpresas.get(this.normalizar(nomeEmpresaRaw)) || nomeEmpresaRaw;

                // --- DATA ---
                let dataRef = null;
                let horaRef = null;
                const rawDate = c['endtime'] || c['datadaauditoria'] || c['data'] || c['date'];
                
                if (rawDate) {
                    if (typeof rawDate === 'object') {
                        dataRef = rawDate.toISOString().split('T')[0];
                        horaRef = rawDate.toLocaleTimeString('pt-BR');
                    } else {
                        try {
                            const dObj = new Date(rawDate);
                            if (!isNaN(dObj)) {
                                dataRef = dObj.toISOString().split('T')[0];
                                horaRef = dObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                            }
                        } catch(e) {}
                    }
                }

                if (!dataRef) {
                    stats.ignorados++;
                    continue;
                }

                // --- PREPARAÇÃO DOS DADOS ---
                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataRef,
                    hora: horaRef,
                    empresa: empresaOficial,
                    
                    nome_documento: c['docname'] || c['documento'] || '',
                    status: c['status'] || '',
                    observacao: c['apontamentosobs'] || c['obs'] || c['apontamentos'] || '',
                    
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['assert'] || c['assertividade'] || c['%assert'] || '',
                    
                    auditora: c['auditora'] || '',
                    quantidade: 1, 
                    fator: 1
                });
            }

            // 4. Envio ao Banco (Otimizado e Seguro)
            if (inserts.length > 0) {
                const totalRegistros = inserts.length;
                const batchSize = 2000;
                const lotes = [];

                for (let i = 0; i < totalRegistros; i += batchSize) {
                    lotes.push(inserts.slice(i, i + batchSize));
                }

                let processados = 0;
                const limiteConcorrencia = 5;
                
                for (let i = 0; i < lotes.length; i += limiteConcorrencia) {
                    const chunk = lotes.slice(i, i + limiteConcorrencia);
                    
                    // CORREÇÃO: Usar async/await explícito para garantir compatibilidade
                    const promessas = chunk.map(async (lote) => {
                        const { error } = await Sistema.supabase.from('producao').insert(lote);
                        if (error) throw error;
                    });
                    
                    // Espera o lote paralelo terminar
                    await Promise.all(promessas);

                    processados += chunk.reduce((acc, curr) => acc + curr.length, 0);
                    const pct = Math.round((processados / totalRegistros) * 100);
                    atualizarStatus(`Salvando... ${pct}%`);
                }

                stats.sucesso = processados;
                
                let msg = `Processo Finalizado!\n\n✅ Registros Importados: ${stats.sucesso}`;
                
                if (logNaoEncontrados.size > 0) {
                    msg += `\n⚠️ Usuários não encontrados: ${logNaoEncontrados.size}.\nO log de erros será baixado.`;
                    this.baixarLog(logNaoEncontrados);
                } else if (stats.ignorados > 0) {
                    msg += `\n⚠️ Linhas ignoradas (sem data): ${stats.ignorados}`;
                }
                
                alert(msg);

                if (Gestao.Assertividade) Gestao.Assertividade.carregar();
            } else {
                if (logNaoEncontrados.size > 0) {
                    alert(`Nenhum registro importado.\n${logNaoEncontrados.size} assistentes não foram encontrados no banco.\nBaixando log...`);
                    this.baixarLog(logNaoEncontrados);
                } else {
                    alert("A planilha parece estar vazia ou com colunas irreconhecíveis.");
                }
            }

        } catch (e) {
            console.error(e);
            alert("Erro fatal: " + e.message);
        } finally {
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = "";
        }
    },

    baixarLog: function(setErros) {
        const lista = Array.from(setErros).join('\n');
        const conteudo = `ERROS DE IMPORTAÇÃO - ${new Date().toLocaleString()}\n\nOs assistentes abaixo constam na planilha mas NÃO estão cadastrados no sistema (Verifique ID e Nome):\n\n${lista}`;
        const blob = new Blob([conteudo], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `erros_importacao_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
    },

    normalizarKey: function(k) {
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }
};